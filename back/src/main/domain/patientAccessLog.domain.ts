import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  PatientAccessLogDomainInterface,
  RecordAccessInput,
} from '../types/domain/patientAccessLog.domain.interface'
import type { PatientAccessLogRepositoryInterface } from '../types/infra/orm/repositories/patientAccessLog.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'
import { CLINICAL_FIELDS } from '../utils/clinical-fields'

const CLINICAL_FIELD_SET: ReadonlySet<string> = new Set(CLINICAL_FIELDS)

class PatientAccessLogDomain implements PatientAccessLogDomainInterface {
  private readonly patientAccessLogRepository: PatientAccessLogRepositoryInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ patientAccessLogRepository, tenantContext }: IocContainer) {
    this.patientAccessLogRepository = patientAccessLogRepository
    this.tenantContext = tenantContext
  }

  // `exportFilters` est le seul champ libre de la table (voir le commentaire du modele,
  // prisma/schema.prisma) — le seul par lequel du contenu clinique pourrait s'y glisser. Refus
  // avant tout appel au depot : une ligne dont les filtres portent une des quatre cles reservees
  // a `clinical:read` (`utils/clinical-fields.ts`) n'est jamais ecrite, meme partiellement.
  //
  // Verifie AVANT de lire le tenant courant, a dessein : le test qui prouve ce refus
  // (patientAccessLog.domain.test.ts) construit le domaine sans tenantContext du tout — inverser
  // l'ordre ferait echouer ce test pour une autre raison que celle qu'il pretend eprouver (un
  // `TenantContextMissingError` au lieu du refus clinique attendu).
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

  private assertNoClinicalContent(exportFilters: string | undefined): void {
    if (exportFilters === undefined) {
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(exportFilters)
    } catch {
      // Non exploitable comme JSON : rien de plus a verifier ici. La validation de forme
      // d'`exportFilters` est hors de la portee de cette tache (voir le brief : le depot et le
      // domaine d'ECRITURE, pas la validation d'entree HTTP).
      return
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return
    }
    for (const key of Object.keys(parsed as Record<string, unknown>)) {
      if (CLINICAL_FIELD_SET.has(key)) {
        throw Boom.badRequest(
          `Le journal des consultations ne peut jamais porter de contenu clinique (cle "${key}")`,
        )
      }
    }
  }
}

export { PatientAccessLogDomain }
