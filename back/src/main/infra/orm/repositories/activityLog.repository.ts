import type { IocContainer } from '../../../types/application/ioc'
import type { PrimaTransactionClient } from '../../../types/infra/orm/client'
import type {
  ActivityLogCreateEntityRepo,
  ActivityLogEntityRepo,
  ActivityLogFindManyParams,
  ActivityLogFindManyResult,
  ActivityLogRepositoryInterface,
  PlatformAccessLogFilters,
} from '../../../types/infra/orm/repositories/activityLog.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

const PAGE_SIZE = 50

// Écran de diagnostic plateforme (tâche 6, étape 4b), pas un export complet — même esprit que
// `ACTIVITY_LOG_DETAIL_LIMIT` (establishment.repository.ts), qui borne le journal d'UN
// établissement pour la même raison.
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

  // Le service courant, plus les entrees ecrites hors service. Les operations
  // de gestion des membres se font dans le contexte d'administration, qui n'a
  // pas de service : leurs lignes portent `serviceId = null` et seraient
  // invisibles — et jamais purgees — si le filtre se limitait au service
  // courant. On ne va pas jusqu'a ouvrir tout l'etablissement : l'activite des
  // autres services n'a pas a apparaitre dans un ecran monte sous un prefixe
  // de service.
  private get serviceFilter() {
    const { serviceId } = this.tenantContext.current()
    return serviceId === null
      ? { serviceId: null }
      : { OR: [{ serviceId }, { serviceId: null }] }
  }

  async findMany({
    page,
    action,
    userID,
    from,
  }: ActivityLogFindManyParams): Promise<ActivityLogFindManyResult> {
    const where = {
      ...this.tenantContext.establishmentScope(),
      ...this.serviceFilter,
      ...(action ? { action } : {}),
      ...(userID ? { userID } : {}),
      ...(from ? { createdAt: { gte: from } } : {}),
    }
    const [data, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.activityLog.count({ where }),
    ])
    return { data, total, page }
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
  // de recopier cette forme ailleurs : la mesure (tour de correction 1, tâche 6) montre que ce
  // qui tient réellement la portée du contexte est l'ENROBAGE `async` du rappel, pas le mot-clé
  // `await` lui-même (un rappel `async` SANS `await` interne reste correct, mesuré sur les 244
  // e2e) — un rappel SYNCHRONE NU, en revanche, perd le contexte (mesuré : 5 tests rougissent en
  // 500). L'`await` ci-dessous reste écrit : `suspicious/useAwait` (Biome, CLAUDE.md) refuse un
  // rappel `async` sans aucun `await`, et un rappel qui ne suspend jamais se lit mal à côté de
  // ses voisins — deux raisons de lisibilité/lint, plus la raison de contexte qu'on croyait.
  async findAllPlatformWide(filters: PlatformAccessLogFilters): Promise<ActivityLogEntityRepo[]> {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        return await this.prisma.activityLog.findMany({
          where: {
            ...(filters.establishmentId ? { establishmentId: filters.establishmentId } : {}),
            ...(filters.userID ? { userID: filters.userID } : {}),
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
  async deleteOlderThan(date: Date): Promise<number> {
    const store = this.tenantContext.peek()
    const where =
      store?.kind === 'tenant'
        ? {
            establishmentId: store.tenant.establishmentId,
            ...this.serviceFilter,
            createdAt: { lt: date },
          }
        : { createdAt: { lt: date } }
    const result = await this.prisma.activityLog.deleteMany({ where })
    return result.count
  }
}

export { ActivityLogRepository }
