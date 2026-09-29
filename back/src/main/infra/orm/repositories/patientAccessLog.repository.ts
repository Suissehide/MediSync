import type { IocContainer } from '../../../types/application/ioc'
import type {
  PatientAccessLogCreateEntityRepo,
  PatientAccessLogEntityRepo,
  PatientAccessLogRepositoryInterface,
  PlatformAccessLogFilters,
} from '../../../types/infra/orm/repositories/patientAccessLog.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import { platformCompteFilter } from '../../../utils/platform-access-log-filters'
import type { PostgresPrismaClient } from '../postgres-client'

// Ecran de diagnostic plateforme (tache 6, etape 4b), pas un export complet — meme esprit que
// `ACTIVITY_LOG_DETAIL_LIMIT` (establishment.repository.ts) et son homologue
// `PLATFORM_ACCESS_LOG_LIMIT` (activityLog.repository.ts, meme tache, meme valeur — duplique
// plutot que partage, comme le type `PlatformAccessLogFilters` : voir son commentaire).
//
// CE QUE CETTE BORNE REND INATTEIGNABLE, dit ici plutot que decouvert (revue finale de branche,
// Important n°1) : le tri est `createdAt desc`, donc au-dela de 200 lignes dans le perimetre
// demande, les PLUS ANCIENNES sortent de la reponse — et AUCUNE pagination ne permet d'y
// revenir. La seule facon de les atteindre est de RESSERRER les filtres (etablissement, compte,
// action) jusqu'a ce que le perimetre demande tienne sous la borne. C'est pour cela que les
// filtres sont evalues EN BASE et non dans le navigateur : un filtre navigateur ne peut, par
// construction, que reduire une page deja tronquee. Voir « Ce qui reste ouvert » (§8),
// docs/multi-tenant/decisions-etape-4b.md.
const PLATFORM_ACCESS_LOG_LIMIT = 200

// Modele : service.repository.ts (cahier des charges de la tache). Le constructeur ne lit
// jamais le scope — chaque methode le fait a son propre appel, via `this.scope` ou
// `this.establishmentScope`. Un acces se journalise toujours a l'interieur d'un service (le
// journal existe pour la consultation d'un dossier patient, qui n'a lieu que sous
// `/e/:establishmentId/s/:serviceId/...`) : `scope()` (et non `establishmentScope()`) est donc la
// bonne methode pour `create`, et son echec — hors de tout contexte de tenant, ou dans le
// contexte d'administration d'etablissement, sans service — est le comportement voulu (voir
// patientAccessLog.domain.test.ts, qui le montre par execution plutot que de le contourner).
//
// Etape 4b, tache 5 (les deux premieres LECTURES) : `findByPatientInService` reprend le meme
// `scope()` que `create` — le cloisonnement par service vient de la, jamais d'un `where` recopie
// a la main.
//
// `findByPatientInEstablishment` EST UNE TRAVERSEE DE FRONTIERE ASSUMEE, DU MEME GENRE QUE
// `PatientServiceFileRepository.impactDesactivation`, PAS UN SIMPLE `establishmentScope()` NU —
// essaye en premier, et ecarte par PREUVE, pas par gout. `PatientAccessLog` reste dans
// `SERVICE_MODELS` (infra/orm/tenant-guard.ts) : le garde-fou de tenant exige `serviceId` pour
// TOUTE operation sur un modele de cette famille, meme une lecture dont le `where` ne porte que
// `establishmentId` — un `establishmentScope()` nu y echoue donc avec `TenantScopeMissingError`,
// depuis le contexte d'administration d'etablissement (`serviceId: null`). Reclasser
// `PatientAccessLog` en `ESTABLISHMENT_MODELS` POUR CONTOURNER CE POINT A ETE ESSAYE, ET REJETE
// PAR LA PREUVE DE MONOTONIE (`tenant-guard-monotonie.test.ts`, MONOTONIE_REF=HEAD, profondeur
// 4 par defaut) : le reclassement perdait **855 refus** (110 chemins d'inclusion imbriquee
// distincts, dont `User.establishmentMemberships>establishment>services>accessLogs` et
// apparentes), repartis sur QUATRE contextes, PAS SEULEMENT `superadmin` et l'absence de
// contexte comme une premiere lecture trop rapide de ce chiffre l'avait laisse croire : 111
// sans contexte, 119 sous superadmin, mais aussi **325 sous le contexte de TENANT ORDINAIRE et
// 300 sous administration d'etablissement** — la majorite de la perte, pas la portion la plus
// petite. La cause reste la meme partout : la transition etablissement -> service que
// `assertServiceRelationFilter` protege ailleurs dans l'arbre cesse de s'appliquer des que la
// CIBLE n'est plus de famille service, quel que soit le contexte qui descend l'arbre. Un gain
// local (cette lecture) n'a pas a payer un cout global de cette ampleur quand un dispositif deja
// eprouve — `runAsSystem` — couvre exactement ce cas sans y toucher.
//
// Meme discipline que `estSuiviAilleurs`/`impactDesactivation` (patientServiceFile.repository.ts) :
// la borne (`establishmentId`, lue via `this.establishmentScope`) est capturee AVANT d'entrer
// dans le mode encadre — `this.establishmentScope` lit le contexte de tenant ORDINAIRE, plus
// disponible une fois `runAsSystem` entame — et portee EXPLICITEMENT par la requete elle-meme,
// puisque le garde-fou n'exige plus rien sous ce mode. Declaree dans
// `runAsSystem-unicite.test.ts` (CAPACITE) ; ses bornes exactes sont verifiees par
// `repository-scope.test.ts` (le `where` reel envoye a Prisma, puis la preuve que cette forme
// serait refusee hors du mode encadre).
class PatientAccessLogRepository
  implements PatientAccessLogRepositoryInterface
{
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  private get establishmentScope() {
    return this.tenantContext.establishmentScope()
  }

  // `await` a l'interieur de cette methode, jamais un simple retour de promesse non attendue :
  // c'est ce qui garde la lecture de `this.scope` — donc du contexte `AsyncLocalStorage` —
  // synchrone et anterieure a l'appel Prisma, plutot que de laisser l'ecriture partir hors de la
  // portee du contexte (piege deja rencontre plusieurs fois sur ce chantier).
  async create(
    params: PatientAccessLogCreateEntityRepo,
  ): Promise<PatientAccessLogEntityRepo> {
    try {
      return await this.prisma.patientAccessLog.create({
        data: { ...params, ...this.scope },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PatientAccessLog',
        error: err,
      })
    }
  }

  // Meme piege que `create`, meme remede : `await` a l'interieur, pour lire `this.scope` avant
  // de quitter la portee synchrone du contexte de tenant.
  async findByPatientInService(
    patientId: string,
  ): Promise<PatientAccessLogEntityRepo[]> {
    try {
      return await this.prisma.patientAccessLog.findMany({
        where: { patientId, ...this.scope },
        orderBy: { createdAt: 'desc' },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PatientAccessLog',
        error: err,
      })
    }
  }

  // `establishmentId` lu ICI, hors du rappel `runAsSystem` : voir le commentaire de classe.
  // `await` a l'INTERIEUR du rappel (meme piege que partout ailleurs sur ce chantier) : un
  // simple retour de promesse laisserait `runAsSystem` restaurer le contexte ordinaire avant que
  // Prisma n'execute reellement la requete, et le garde-fou verrait alors le mauvais store.
  async findByPatientInEstablishment(
    patientId: string,
  ): Promise<PatientAccessLogEntityRepo[]> {
    const { establishmentId } = this.establishmentScope
    try {
      return await this.tenantContext.runAsSystem(async () => {
        return await this.prisma.patientAccessLog.findMany({
          where: { patientId, establishmentId },
          orderBy: { createdAt: 'desc' },
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PatientAccessLog',
        error: err,
      })
    }
  }

  // Etape 4b, tache 6 : `GET /super-admin/access-log` (source=acces) — SANS borne de tenant, a
  // l'echelle de la PLATEFORME entiere. `PatientAccessLog: ['findMany']` est desormais declare
  // dans `SUPERADMIN_OPERATIONS` (tenant-guard.ts) : sous `runAsSuperAdmin`,
  // `assertTenantReadScope` ne s'applique qu'au contexte `tenant` (jamais `superadmin`), donc
  // aucun `where` n'est exige ici — memes termes que `Service.count`/`Patient.count` (commentaire
  // au-dessus de `SUPERADMIN_OPERATIONS`).
  //
  // `await` A L'INTERIEUR du rappel — mais lisez `utils/tenant-context.ts#runAsSuperAdmin` avant
  // de recopier cette forme ailleurs. ENONCE EXACT (revue finale de branche, Important n°5 — ce
  // commentaire portait encore l'enonce intermediaire, « ce qui tient la portee est l'enrobage
  // `async` », que `back/CLAUDE.md` et l'annexe des decisions nomment desormais comme un
  // SYMPTOME) : **ce qui compte, c'est que la lecture du contexte survienne AVANT le premier
  // point de suspension**. Un rappel SYNCHRONE NU perd le contexte ICI (mesure, tour de
  // correction 1 de la tache 6 : 5 tests rougissent en 500, exactement les cinq `source=acces`)
  // parce que la requete Prisma est PARESSEUSE — rien n'est lu avant que `run` n'ait rendu la
  // main. Le meme rappel synchrone nu convient parfaitement a `deleteOlderThan`, quarante lignes
  // plus bas, qui lit `tenantContext.peek()` synchroniquement en tete de son corps. L'`await`
  // ci-dessous reste ecrit pour le lint (`suspicious/useAwait`) et la lisibilite.
  //
  // A LA DIFFERENCE DE `findByPatientInEstablishment` CI-DESSUS, ce n'est PAS une traversee de
  // frontiere non declaree sous `runAsSystem` : c'est la capacite superadmin, exhaustive par
  // construction, qui autorise explicitement ce couple (modele, operation) — retirer l'entree de
  // `SUPERADMIN_OPERATIONS` fait refuser cette methode avec `TenantScopeMissingError`, jamais
  // rendre une liste vide (verifie par sabotage, voir le rapport de tache).
  async findAllPlatformWide(
    filters: PlatformAccessLogFilters,
  ): Promise<PatientAccessLogEntityRepo[]> {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        return await this.prisma.patientAccessLog.findMany({
          where: {
            // `filters.sansEtablissement` n'est jamais lu ici : `establishmentId` est NON
            // NULLABLE sur ce modele, et le schema HTTP refuse la combinaison par un 400 —
            // voir le commentaire de `PlatformAccessLogFilters` (interface de ce depot).
            ...(filters.establishmentId
              ? { establishmentId: filters.establishmentId }
              : {}),
            ...platformCompteFilter(filters.compte),
            ...(filters.action ? { action: filters.action } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: PLATFORM_ACCESS_LOG_LIMIT,
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PatientAccessLog',
        error: err,
      })
    }
  }

  // Purge planifiee (tache 8, etape 4b) : meme mecanisme qu'`ActivityLogRepository.
  // deleteOlderThan`. Sous `runAsSystem` (kind 'system'), `tenantContext.peek()` ne rend jamais
  // 'tenant' : la purge touche alors TOUTE la table, sans poser `serviceId` -- a la difference
  // d'`ActivityLog`, `PatientAccessLog` n'a pas de ligne "hors service" (`create` pose toujours
  // `this.scope`), donc pas de filtre equivalent au `serviceFilter` de l'autre depot a reprendre
  // ici. AUCUN try/catch ici, a dessein : `application/starter.ts` (le seul appelant, via
  // `PatientAccessLogDomain.cleanup`) ne journalise que la CLASSE de l'erreur dans son `catch`,
  // jamais son message brut -- une erreur Prisma non absorbee ici y recopierait sinon le `data`
  // de l'ecriture ratee (meme raison que `deleteOlderThan` d'`ActivityLogRepository`, qui n'a pas
  // non plus de `catch` propre).
  async deleteOlderThan(date: Date): Promise<number> {
    const store = this.tenantContext.peek()
    const where =
      store?.kind === 'tenant'
        ? { ...this.scope, createdAt: { lt: date } }
        : { createdAt: { lt: date } }
    const result = await this.prisma.patientAccessLog.deleteMany({ where })
    return result.count
  }
}

export { PatientAccessLogRepository }
