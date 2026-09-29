import type { IocContainer } from '../../../types/application/ioc'
import type { PrimaTransactionClient } from '../../../types/infra/orm/client'
import type {
  ActivityLogCreateEntityRepo,
  ActivityLogEntityRepo,
  ActivityLogFindManyParams,
  ActivityLogFindManyResult,
  ActivityLogRepositoryInterface,
  ActivityLogScopeFilters,
  PlatformAccessLogFilters,
} from '../../../types/infra/orm/repositories/activityLog.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import { platformCompteFilter } from '../../../utils/platform-access-log-filters'
import type { PostgresPrismaClient } from '../postgres-client'

const PAGE_SIZE = 50

// Écran de diagnostic plateforme (tâche 6, étape 4b), pas un export complet — même esprit que
// `ACTIVITY_LOG_DETAIL_LIMIT` (establishment.repository.ts), qui borne le journal d'UN
// établissement pour la même raison.
//
// CE QUE CETTE BORNE REND INATTEIGNABLE, dit ici plutôt que découvert (revue finale de branche,
// Important n°1) : le tri est `createdAt desc`, donc au-delà de 200 lignes dans le périmètre
// demandé, les PLUS ANCIENNES sortent de la réponse — et aucune pagination ne permet d'y
// revenir. Ce sont précisément les lignes du script d'amorçage (`establishmentId: null`), dont
// la documentation présentait la lisibilité comme acquise. D'où le filtre `sansEtablissement`
// ci-dessous : il resserre le périmètre à ces lignes-là, qui tiennent alors très largement sous
// la borne. Voir « Ce qui reste ouvert » (§8), docs/multi-tenant/decisions-etape-4b.md.
const PLATFORM_ACCESS_LOG_LIMIT = 200

class ActivityLogRepository implements ActivityLogRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly tenantContext: TenantContextInterface
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, tenantContext, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.tenantContext = tenantContext
    this.errorHandler = errorHandler
  }

  // Contexte lu au moment de l'écriture : null hors requête (runAsSystem).
  private get contextColumns(): {
    establishmentId: string | null
    serviceId: string | null
  } {
    const store = this.tenantContext.peek()
    if (!store || store.kind !== 'tenant') {
      return { establishmentId: null, serviceId: null }
    }
    return {
      establishmentId: store.tenant.establishmentId,
      serviceId: store.tenant.serviceId,
    }
  }

  // `client` optionnel (tour de correction 1, tâche 11) : `UserDomain.bootstrapSuperAdmin`
  // l'appelle sous transaction, avec les écritures de `User` qu'elle journalise — pour qu'une
  // écriture ne puisse jamais survivre seule à l'échec de l'autre. Try/catch ajouté au même
  // tour : cette méthode était la seule du dépôt à écrire sans passer par
  // `errorHandler.boomErrorFromPrismaError`, contrairement à toutes ses voisines
  // (`user.repository.ts` notamment) — une erreur Prisma brute, dont le message recopie
  // intégralement le `data` de l'écriture ratée (userID, action, entityID…), pouvait donc
  // atteindre un appelant sans être absorbée.
  async create(
    params: ActivityLogCreateEntityRepo,
    client: PrimaTransactionClient = this.prisma,
  ): Promise<void> {
    try {
      await client.activityLog.create({
        data: { ...params, ...this.contextColumns },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ActivityLog',
        error: err,
      })
    }
  }

  // Perimetre de lecture et de purge, en plus de `establishmentScope()`.
  //
  // Sous le contexte d'ETABLISSEMENT (administration, `serviceId` nul) — le seul ou les routes
  // du journal sont montees depuis la navigation par echelle (2026-09-28) : tout
  // l'etablissement, tous services confondus, lignes sans service comprises. C'est le perimetre
  // que `docs/multi-tenant/habilitations.md` donne a `activity-log:read` (« journal d'activite de
  // l'etablissement »), prerogative de l'administrateur. `filters.serviceId` le resserre a un
  // service ; `establishmentScope()` garantit qu'un service d'un autre etablissement ne rend rien.
  //
  // Sous un contexte de SERVICE : le service courant plus les lignes sans service, comme
  // avant le demenagement. Aucune route ne l'emprunte plus ; la branche reste pour que le depot
  // ne s'ouvre jamais a tout l'etablissement depuis un prefixe de service si une route y
  // revenait. `filters` y est ignore.
  private scopeFilter(filters: ActivityLogScopeFilters = {}) {
    const { serviceId } = this.tenantContext.current()
    if (serviceId !== null) {
      return { OR: [{ serviceId }, { serviceId: null }] }
    }
    return filters.serviceId ? { serviceId: filters.serviceId } : {}
  }

  async findMany({
    page,
    pageSize = PAGE_SIZE,
    action,
    userID,
    user,
    from,
    serviceId,
  }: ActivityLogFindManyParams): Promise<ActivityLogFindManyResult> {
    const where = {
      ...this.tenantContext.establishmentScope(),
      ...this.scopeFilter({ serviceId }),
      ...(action ? { action } : {}),
      ...(userID ? { userID } : {}),
      ...(from ? { createdAt: { gte: from } } : {}),
      // Chaque mot doit figurer dans le prenom ou le nom recopies dans la ligne (ceux de
      // l'auteur au moment de l'action). Cote serveur, et non plus sur la seule page affichee :
      // c'est ce qui rend la recherche juste sur tout le journal (relecture de branche,
      // 2026-09-28). `AND` et non `OR` au premier niveau : `scopeFilter` peut deja poser un `OR`.
      ...(user ? { AND: this.userSearchFilter(user) } : {}),
    }
    const [data, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activityLog.count({ where }),
    ])
    return { data, total, page, pageSize }
  }

  private userSearchFilter(user: string) {
    return user
      .split(/\s+/)
      .filter(Boolean)
      .map((mot) => ({
        OR: [
          { userFirstName: { contains: mot, mode: 'insensitive' as const } },
          { userLastName: { contains: mot, mode: 'insensitive' as const } },
        ],
      }))
  }

  // Tâche 6, étape 4b : `GET /super-admin/access-log` (source=activite) — SANS borne de tenant,
  // à l'échelle de la plateforme entière. `ActivityLog.findMany` est déjà déclaré dans
  // `SUPERADMIN_OPERATIONS` (tâche 1) : encadré par `runAsSuperAdmin`. C'est cette lecture, sans
  // aucun `establishmentId` dans le `where`, qui rend enfin lisibles les lignes du script
  // d'amorçage (`UserDomain.bootstrapSuperAdmin`, écrites sous `runAsSystem`,
  // `establishmentId: null`) : aucune autre route ne les filtrait jusqu'ici, ni la lecture
  // d'établissement (`establishment.repository.ts#activityLogFor`, qui exige un
  // `establishmentId` précis), ni le tenant ordinaire (`findMany` ci-dessus, qui n'existe que
  // sous un tenant).
  //
  // `await` À L'INTÉRIEUR du rappel — mais lisez `utils/tenant-context.ts#runAsSuperAdmin` avant
  // de recopier cette forme ailleurs. ÉNONCÉ EXACT (revue finale de branche, Important n°5 — ce
  // commentaire portait encore l'énoncé intermédiaire, « ce qui tient la portée est l'enrobage
  // `async` », que `back/CLAUDE.md` et l'annexe des décisions nomment désormais comme un
  // SYMPTÔME) : **ce qui compte, c'est que la lecture du contexte survienne AVANT le premier
  // point de suspension**. Un rappel SYNCHRONE NU perd le contexte ICI (mesuré, tour de
  // correction 1 de la tâche 6 : 5 tests rougissent en 500) parce que la requête Prisma est
  // PARESSEUSE — rien n'est lu avant que `run` n'ait rendu la main. Le même rappel synchrone nu
  // convient parfaitement ailleurs s'il lit tout de suite : `deleteOlderThan`, quarante lignes
  // plus bas, appelle `tenantContext.peek()` synchroniquement en tête de son corps, et la
  // propriété tient. L'`await` ci-dessous reste écrit pour le lint (`suspicious/useAwait`) et la
  // lisibilité.
  async findAllPlatformWide(filters: PlatformAccessLogFilters): Promise<ActivityLogEntityRepo[]> {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        return await this.prisma.activityLog.findMany({
          where: {
            // Trois états, jamais deux à la fois — la valeur réservée `SANS_ETABLISSEMENT` du
            // schéma HTTP arrive ici sous la forme du booléen, pas d'un identifiant, et elle
            // l'emporte si jamais les deux venaient à coexister (voir le commentaire de
            // `PlatformAccessLogFilters`). C'est la SEULE façon d'atteindre les lignes du script
            // d'amorçage une fois le journal au-delà de 200 entrées : elles n'ont pas
            // d'établissement, et ce sont les plus anciennes de la table.
            ...(filters.sansEtablissement
              ? { establishmentId: null }
              : filters.establishmentId
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
        entityName: 'ActivityLog',
        error: err,
      })
    }
  }

  // Sous runAsSystem (purge planifiee) : toute la table. Sous un tenant : le
  // meme perimetre que la lecture, pour que tout ce qui s'affiche soit
  // purgeable et que rien d'autre ne le soit.
  async deleteOlderThan(date: Date, filters: ActivityLogScopeFilters = {}): Promise<number> {
    const store = this.tenantContext.peek()
    const where =
      store?.kind === 'tenant'
        ? {
            establishmentId: store.tenant.establishmentId,
            ...this.scopeFilter(filters),
            createdAt: { lt: date },
          }
        : { createdAt: { lt: date } }
    const result = await this.prisma.activityLog.deleteMany({ where })
    return result.count
  }
}

export { ActivityLogRepository }
