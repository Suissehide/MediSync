import Boom from '@hapi/boom'

import type { Config } from '../types/application/config'
import type { IocContainer } from '../types/application/ioc'
import type {
  PatientAccessLogDomainInterface,
  PatientAccessLogEntityDomain,
  RecordAccessInput,
} from '../types/domain/patientAccessLog.domain.interface'
import type {
  PatientAccessLogRepositoryInterface,
  PlatformAccessLogFilters,
} from '../types/infra/orm/repositories/patientAccessLog.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'
import { CLINICAL_FIELDS } from '../utils/clinical-fields'

const CLINICAL_FIELD_SET: ReadonlySet<string> = new Set(CLINICAL_FIELDS)

class PatientAccessLogDomain implements PatientAccessLogDomainInterface {
  private readonly patientAccessLogRepository: PatientAccessLogRepositoryInterface
  private readonly tenantContext: TenantContextInterface
  private readonly config: Config

  constructor({ patientAccessLogRepository, tenantContext, config }: IocContainer) {
    this.patientAccessLogRepository = patientAccessLogRepository
    this.tenantContext = tenantContext
    this.config = config
  }

  // `exportFilters` est le seul champ libre de la table (voir le commentaire du modele,
  // prisma/schema.prisma) — le seul par lequel du contenu clinique pourrait s'y glisser. Refus
  // avant tout appel au depot : une ligne dont les filtres portent une des quatre cles reservees
  // a `clinical:read` (`utils/clinical-fields.ts`) n'est jamais ecrite, meme partiellement.
  //
  // TOUR DE CORRECTION 1 (revue) — cette garde est verifiee sur le CHEMIN REEL
  // (patientAccessLog.domain.test.ts monte desormais un `tenantContext` reel, entre par
  // `ctx.run`, avant d'appeler `record`), pas seulement avec un domaine construit sans
  // tenantContext. La revue a demontre par execution que l'ancienne version du test (domaine
  // sans tenantContext) rougissait bien sous un sabotage etroit (retirer `notes` de la liste
  // verifiee) — mais pour la MAUVAISE raison : un `TypeError` sur `this.tenantContext.current()`
  // undefined, pas le rejet clinique que l'assertion `/clinique/i` pretendait eprouver. Rejoue
  // avec un tenantContext reel, le meme sabotage laissait la ligne s'ecrire, `exportFilters`
  // clinique intact, dans l'appel Prisma capture — la garde ne protegeait donc RIEN sur le
  // chemin de production. Verifier avant ou apres la lecture du tenant ne change plus rien au
  // resultat de ce test desormais.
  async record(input: RecordAccessInput): Promise<void> {
    this.assertNoClinicalContent(input.exportFilters)
    // Decision du 2026-09-27 (etape 4b) : un acces obtenu par octroi temporaire (superadmin muni
    // d'un SuperAdminAccessGrant vivant) emprunte le chemin de tenant ordinaire, avec les memes
    // appartenances qu'un membre reel (`effectiveMemberships`,
    // domain/accessGrant.domain.ts) — il serait donc journalise de facon indiscernable d'un
    // acces de soin sans cette colonne. `tenantContext.current().origine` porte cette
    // information (`resolveTenantFromUser`, interfaces/http/fastify/plugins/tenant.plugin.ts) ;
    // absente (contexte construit hors de cette resolution, comme dans la plupart des tests de
    // ce depot), elle vaut par defaut un acces reel — jamais l'inverse.
    const { origine } = this.tenantContext.current()
    await this.patientAccessLogRepository.create({
      ...input,
      accesParOctroi: origine === 'octroi',
    })
  }

  // Etape 4b, tache 5 : simples relais vers le depot — aucune logique metier ici, le
  // cloisonnement se joue entierement dans `PatientAccessLogRepository` (`scope()` vs
  // `establishmentScope()`, voir son commentaire). Le filtrage du contenu clinique (aucun ici,
  // par construction du schema Zod de reponse) n'a pas besoin d'etre reecrit : ce que ces deux
  // methodes rendent n'est jamais un dossier patient, seulement des lignes du journal d'audit.
  findByPatientInService(patientId: string): Promise<PatientAccessLogEntityDomain[]> {
    return this.patientAccessLogRepository.findByPatientInService(patientId)
  }

  findByPatientInEstablishment(patientId: string): Promise<PatientAccessLogEntityDomain[]> {
    return this.patientAccessLogRepository.findByPatientInEstablishment(patientId)
  }

  findAllPlatformWide(
    filters: PlatformAccessLogFilters,
  ): Promise<PatientAccessLogEntityDomain[]> {
    return this.patientAccessLogRepository.findAllPlatformWide(filters)
  }

  // Retention parametrable (tache 8, etape 4b) : `config.logRetentionMonths`, jamais douze en
  // dur -- meme calcul qu'`ActivityLogDomain.cleanup`, DUPLIQUE plutot que factorise a dessein
  // (voir son commentaire) : un sabotage qui remet douze en dur ici seul ne doit faire rougir que
  // le test de CE domaine.
  async cleanup(): Promise<{ deleted: number }> {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - this.config.logRetentionMonths)
    const deleted = await this.patientAccessLogRepository.deleteOlderThan(cutoff)
    return { deleted }
  }

  // TOUR DE CORRECTION 1 (revue) — deux trous elargis a dessein, sur la SEULE barriere qui
  // protege ce journal de contenu clinique :
  //   - la verification etait limitee au premier niveau des cles ; un filtre exotique portant
  //     la cle clinique sous un objet ou un tableau imbrique (`{ criteres: [{ notes: '...' }] }`)
  //     passait sans etre vu. `findClinicalKey` descend desormais recursivement dans les objets
  //     ET les tableaux.
  //   - une chaine non analysable comme JSON etait silencieusement ACCEPTEE (`return` dans le
  //     `catch`) — la seule barriere du journal laissait alors passer tout ce qu'elle ne savait
  //     pas lire. Elle REFUSE desormais, au lieu d'accepter par defaut.
  private assertNoClinicalContent(exportFilters: string | undefined): void {
    if (exportFilters === undefined) {
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(exportFilters)
    } catch {
      throw Boom.badRequest(
        "Le journal des consultations refuse un exportFilters non analysable (JSON invalide) : impossible de garantir l'absence de contenu clinique",
      )
    }
    const key = this.findClinicalKey(parsed)
    if (key !== null) {
      throw Boom.badRequest(
        `Le journal des consultations ne peut jamais porter de contenu clinique (cle "${key}")`,
      )
    }
  }

  // Cherche une cle clinique (`utils/clinical-fields.ts`) a n'importe quelle profondeur, dans un
  // objet comme dans un tableau — la forme exacte de `exportFilters` n'est pas figee, et un
  // filtre exotique ne doit pas pouvoir se nicher hors de portee de cette recherche. Scindee en
  // trois petites methodes (plutot qu'une seule recursive) pour rester sous le seuil de
  // complexite cognitive du lint.
  private findClinicalKey(value: unknown): string | null {
    if (Array.isArray(value)) {
      return this.findClinicalKeyInList(value)
    }
    if (typeof value === 'object' && value !== null) {
      return this.findClinicalKeyInObject(value as Record<string, unknown>)
    }
    return null
  }

  private findClinicalKeyInList(items: unknown[]): string | null {
    for (const item of items) {
      const found = this.findClinicalKey(item)
      if (found !== null) {
        return found
      }
    }
    return null
  }

  private findClinicalKeyInObject(obj: Record<string, unknown>): string | null {
    for (const [key, nested] of Object.entries(obj)) {
      if (CLINICAL_FIELD_SET.has(key)) {
        return key
      }
      const found = this.findClinicalKey(nested)
      if (found !== null) {
        return found
      }
    }
    return null
  }
}

export { PatientAccessLogDomain }
