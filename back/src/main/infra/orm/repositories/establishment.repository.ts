import type { IocContainer } from '../../../types/application/ioc'
import type { PrimaTransactionClient } from '../../../types/infra/orm/client'
import type {
  EstablishmentCounters,
  EstablishmentMembershipRow,
  EstablishmentRepositoryInterface,
  FirstAdmin,
} from '../../../types/infra/orm/repositories/establishment.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class EstablishmentRepository implements EstablishmentRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  async create(name: string, client: PrimaTransactionClient = this.prisma) {
    try {
      return await client.establishment.create({ data: { name } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Establishment',
        error: err,
      })
    }
  }

  // `EstablishmentMembership.create` figure dans SUPERADMIN_OPERATIONS (tenant-guard.ts, tâche
  // 1) : c'est la seule écriture qu'un compte super-admin peut effectuer sur un modèle
  // d'établissement, hors de tout tenant courant. Encadrée par `runAsSuperAdmin`, avec
  // `await` À L'INTÉRIEUR du rappel — une requête Prisma est paresseuse (piège de la tâche 1,
  // resurgi identique ici : sans ce `await` interne, la requête part hors de la portée du
  // contexte et le garde-fou lit le tenant ambiant, pas `superadmin`). Ce `runAsSuperAdmin`
  // reste posé ici même quand l'appelant (`EstablishmentDomain.createWithFirstAdmin`, tour de
  // correction 1) en a déjà ouvert un englobant : nester deux `run` de même nature est sans
  // effet (`AsyncLocalStorage.run` est réentrant), et ça garde cette méthode sûre par
  // elle-même pour un futur appelant qui ne l'ouvrirait pas.
  async attachAdmin(
    establishmentId: string,
    userId: string,
    client: PrimaTransactionClient = this.prisma,
  ) {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        return await client.establishmentMembership.create({
          data: { establishmentId, userId, role: 'ADMIN' },
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'EstablishmentMembership',
        error: err,
      })
    }
  }

  // Tâche 7 : lecture nue d'un modèle global, sans contexte — comme `create` ci-dessus.
  async findAll() {
    try {
      return await this.prisma.establishment.findMany({ orderBy: { createdAt: 'asc' } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Establishment',
        error: err,
      })
    }
  }

  async findByIdOrThrow(id: string) {
    try {
      return await this.prisma.establishment.findUniqueOrThrow({ where: { id } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Establishment',
        error: err,
      })
    }
  }

  async findManyByIds(ids: string[]) {
    if (ids.length === 0) {
      return []
    }
    try {
      return await this.prisma.establishment.findMany({ where: { id: { in: ids } } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Establishment',
        error: err,
      })
    }
  }

  // Compteurs de la liste/du détail (spec §3.3) pour UN établissement. `Service.count`,
  // `EstablishmentMembership.count`/`.findMany` et `Patient.count` sont déclarés dans
  // SUPERADMIN_OPERATIONS (tâche 1) : encadrés par `runAsSuperAdmin`, `await` À L'INTÉRIEUR du
  // rappel (même piège que `attachAdmin` ci-dessus). `Patient.findMany` n'est volontairement PAS
  // déclaré : seul `count` l'est, donc seul un nombre peut sortir d'ici, jamais une ligne.
  //
  // `firstAdmin` et `lastAccessAt` retombent sur `User`, un modèle global : au lieu d'un
  // `include: { user: true }` sur `EstablishmentMembership.findMany` (refusé par
  // `assertNoGlobalBridgeUnderSuperAdmin`), une SECONDE lecture nue sur `User` par ses
  // identifiants, puis une jointure EN MÉMOIRE — le contournement sûr documenté au-dessus de
  // `SUPERADMIN_OPERATIONS` (tenant-guard.ts).
  async countersFor(establishmentId: string): Promise<EstablishmentCounters> {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        const [serviceCount, accountCount, patientCount, memberships] = await Promise.all([
          this.prisma.service.count({ where: { establishmentId } }),
          this.prisma.establishmentMembership.count({ where: { establishmentId } }),
          this.prisma.patient.count({ where: { establishmentId } }),
          this.prisma.establishmentMembership.findMany({
            where: { establishmentId },
            select: { userId: true, role: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          }),
        ])

        const userIds = [...new Set(memberships.map((m) => m.userId))]
        const users = userIds.length
          ? await this.prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, email: true, deactivatedAt: true, lastLoginAt: true },
            })
          : []
        const userById = new Map(users.map((u) => [u.id, u]))

        let firstAdmin: FirstAdmin = null
        for (const membership of memberships) {
          if (membership.role !== 'ADMIN') {
            continue
          }
          const user = userById.get(membership.userId)
          if (user && user.deactivatedAt === null) {
            firstAdmin = { id: user.id, email: user.email }
            break
          }
        }

        const lastAccessAt = users.reduce<Date | null>((max, u) => {
          if (!u.lastLoginAt) {
            return max
          }
          return !max || u.lastLoginAt > max ? u.lastLoginAt : max
        }, null)

        return { serviceCount, accountCount, patientCount, firstAdmin, lastAccessAt }
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Establishment',
        error: err,
      })
    }
  }

  // Recherche d'un compte (spec §3.4, tâche 7) : tous les rattachements d'UN compte, tous
  // établissements confondus. `EstablishmentMembership.findMany` est déclaré (tâche 1) ; le nom
  // de chaque établissement est résolu ailleurs (`findManyByIds`, appelé par
  // `UserDomain.searchByEmail`), jamais par un `include` imbriqué.
  async membershipsForUser(userId: string): Promise<EstablishmentMembershipRow[]> {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        return await this.prisma.establishmentMembership.findMany({
          where: { userId },
          select: { id: true, userId: true, establishmentId: true, role: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'EstablishmentMembership',
        error: err,
      })
    }
  }
}

export { EstablishmentRepository }
