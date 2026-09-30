import type { IocContainer } from '../../../types/application/ioc'
import type { PrimaTransactionClient } from '../../../types/infra/orm/client'
import type { ActivityLogEntityRepo } from '../../../types/infra/orm/repositories/activityLog.repository.interface'
import type {
  EstablishmentCounters,
  EstablishmentMemberRow,
  EstablishmentMembershipRow,
  EstablishmentRepositoryInterface,
  EstablishmentServiceRow,
  FirstAdmin,
} from '../../../types/infra/orm/repositories/establishment.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

// Le détail d'un établissement (spec §6.2) est un écran de diagnostic, pas un export complet :
// la dernière tranche du journal, pas son historique entier. `ActivityLog.findMany` est déclaré
// SANS limite de page dans SUPERADMIN_OPERATIONS — la borne est donc prise ici, côté
// appelant, nommée pour qu'elle ne soit pas un nombre magique perdu dans un `take`.
const ACTIVITY_LOG_DETAIL_LIMIT = 100

// Repli défensif, nommé plutôt que laissé en `?? ''` silencieux :
// `membersFor` vient de lire la ligne `EstablishmentMembership`, son `userId` DEVRAIT donc
// toujours trouver un `User` — sauf suppression physique d'un compte, qu'aucune route n'effectue
// aujourd'hui. Une chaîne vide plutôt qu'une exception : un diagnostic de super-admin doit
// rester utilisable même face à une incohérence, pas s'arrêter dessus.
const UNRESOLVED_ACCOUNT_EMAIL = ''

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

  // `EstablishmentMembership.create` figure dans SUPERADMIN_OPERATIONS (tenant-guard.ts) :
  // c'est la seule écriture qu'un compte super-admin peut effectuer sur un modèle
  // d'établissement, hors de tout tenant courant. Encadrée par `runAsSuperAdmin`, avec
  // `await` À L'INTÉRIEUR du rappel — une requête Prisma est paresseuse : sans ce `await`
  // interne, la requête part hors de la portée du contexte et le garde-fou lit le tenant
  // ambiant, pas `superadmin`. Ce `runAsSuperAdmin` reste posé ici même quand l'appelant
  // (`EstablishmentDomain.createWithFirstAdmin`) en a déjà ouvert un englobant : nester deux
  // `run` de même nature est sans effet (`AsyncLocalStorage.run` est réentrant), et ça garde
  // cette méthode sûre par elle-même pour un futur appelant qui ne l'ouvrirait pas.
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

  // Lecture nue d'un modèle global, sans contexte — comme `create` ci-dessus.
  async findAll() {
    try {
      return await this.prisma.establishment.findMany({
        orderBy: { createdAt: 'asc' },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Establishment',
        error: err,
      })
    }
  }

  async findByIdOrThrow(id: string) {
    try {
      return await this.prisma.establishment.findUniqueOrThrow({
        where: { id },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Establishment',
        error: err,
      })
    }
  }

  // Les routes `/super-admin` s'exécutent sans store : sans ce `runAsSuperAdmin`, l'`update`
  // tomberait sous NO_CONTEXT_GLOBAL_OPERATIONS, qui le refuse (500). Même piège d'`await` que
  // `attachAdmin`. 404 si l'id est inconnu.
  async rename(id: string, name: string) {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        return await this.prisma.establishment.update({
          where: { id },
          data: { name },
        })
      })
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
      return await this.prisma.establishment.findMany({
        where: { id: { in: ids } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Establishment',
        error: err,
      })
    }
  }

  // Compteurs de la liste/du détail (spec §3.3) pour UN établissement. `Service.count`,
  // `EstablishmentMembership.findMany`, `Patient.count` et `ActivityLog.findMany` sont déclarés
  // dans SUPERADMIN_OPERATIONS : encadrés par `runAsSuperAdmin`, `await` À
  // L'INTÉRIEUR du rappel (même piège que `attachAdmin` ci-dessus). `Patient.findMany` n'est
  // volontairement PAS déclaré : seul `count` l'est, donc seul un nombre peut sortir d'ici,
  // jamais une ligne.
  //
  // RÈGLE DE COMPTAGE DES DÉSACTIVÉS — voir le commentaire complet sur `EstablishmentCounters`
  // (établissement.repository.interface.ts) :
  // `serviceCount` exclut les services désactivés (`deactivatedAt: null` en base, sans jointure
  // — une colonne propre à `Service`) ; `accountCount` exclut, EN MÉMOIRE, les comptes dont le
  // `User` lié est désactivé, pour la même raison que `firstAdmin` juste en dessous : ces trois
  // signaux répondent tous à « cet établissement est-il vivant », donc tous excluent qui ne
  // peut plus s'en servir.
  //
  // `firstAdmin` retombe sur `User`, un modèle global : au lieu d'un `include: { user: true }`
  // sur `EstablishmentMembership.findMany` (refusé par `assertNoGlobalBridgeUnderSuperAdmin`),
  // une SECONDE lecture nue sur `User` par ses identifiants, puis une jointure EN MÉMOIRE — le
  // contournement sûr documenté au-dessus de `SUPERADMIN_OPERATIONS` (tenant-guard.ts).
  //
  // `lastActivityAt` (RENOMMÉ depuis `lastAccessAt`) vient d'`ActivityLog`, filtré sur CET
  // établissement — jamais de `User.lastLoginAt`, qui ne dit rien sur CET établissement
  // précisément (un membre de deux établissements connecté à l'un faisait, à tort, bouger
  // l'autre).
  async countersFor(establishmentId: string): Promise<EstablishmentCounters> {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        const [serviceCount, patientCount, memberships, latestActivity] =
          await Promise.all([
            this.prisma.service.count({
              where: { establishmentId, deactivatedAt: null },
            }),
            this.prisma.patient.count({ where: { establishmentId } }),
            this.prisma.establishmentMembership.findMany({
              where: { establishmentId },
              select: { userId: true, role: true, createdAt: true },
              // Départage à créneau égal — voir le commentaire sur `FirstAdmin`
              // (establishment.repository.interface.ts).
              orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
            }),
            this.prisma.activityLog.findMany({
              where: { establishmentId },
              select: { createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            }),
          ])

        const userIds = [...new Set(memberships.map((m) => m.userId))]
        const users = userIds.length
          ? await this.prisma.user.findMany({
              where: { id: { in: userIds } },
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                deactivatedAt: true,
              },
            })
          : []
        const userById = new Map(users.map((u) => [u.id, u]))

        const accountCount = [...userById.values()].filter(
          (u) => u.deactivatedAt === null,
        ).length

        let firstAdmin: FirstAdmin = null
        for (const membership of memberships) {
          if (membership.role !== 'ADMIN') {
            continue
          }
          const user = userById.get(membership.userId)
          if (user && user.deactivatedAt === null) {
            firstAdmin = {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
            }
            break
          }
        }

        const lastActivityAt = latestActivity[0]?.createdAt ?? null

        return {
          serviceCount,
          accountCount,
          patientCount,
          firstAdmin,
          lastActivityAt,
        }
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Establishment',
        error: err,
      })
    }
  }

  // `Patient.count` pour `EstablishmentDomain.getById` : la seule lecture du détail qui ne
  // peut pas être dérivée d'un tableau déjà chargé
  // (`Patient.findMany` n'est pas déclaré, spec §3.3) — une petite duplication du `count` inline
  // de `countersFor` ci-dessus, préférée à un partage qui aurait fait sortir l'appel Prisma de
  // son `runAsSuperAdmin` synchrone (même piège que partout ailleurs : `await` À L'INTÉRIEUR du
  // rappel).
  async patientCountFor(establishmentId: string): Promise<number> {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        return await this.prisma.patient.count({ where: { establishmentId } })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }

  // Recherche d'un compte (spec §3.4) : tous les rattachements d'UN compte, tous
  // établissements confondus. `EstablishmentMembership.findMany` est déclaré dans
  // SUPERADMIN_OPERATIONS ; le nom de chaque établissement est résolu ailleurs
  // (`findManyByIds`, appelé par `UserDomain.searchByEmail`), jamais par un `include` imbriqué.
  async membershipsForUser(
    userId: string,
  ): Promise<EstablishmentMembershipRow[]> {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        return await this.prisma.establishmentMembership.findMany({
          where: { userId },
          select: {
            id: true,
            userId: true,
            establishmentId: true,
            role: true,
            createdAt: true,
          },
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

  // Détail d'un établissement (spec §6.2) : ses services, quel que soit
  // leur état — désactivé n'est pas supprimé, l'écran de diagnostic doit le montrer, à la
  // différence du compteur `serviceCount` ci-dessus qui, lui, ne compte que l'utilisable.
  async servicesFor(
    establishmentId: string,
  ): Promise<EstablishmentServiceRow[]> {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        return await this.prisma.service.findMany({
          where: { establishmentId },
          select: {
            id: true,
            name: true,
            createdAt: true,
            deactivatedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Service',
        error: err,
      })
    }
  }

  // Les membres de l'établissement (spec §6.2), désactivés compris — même raison que
  // `servicesFor`. Même contournement que `countersFor` : deux lectures (`EstablishmentMembership`
  // puis `User` par ses identifiants), jointes EN MÉMOIRE.
  async membersFor(establishmentId: string): Promise<EstablishmentMemberRow[]> {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        const memberships = await this.prisma.establishmentMembership.findMany({
          where: { establishmentId },
          select: { userId: true, role: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
        })

        const userIds = [...new Set(memberships.map((m) => m.userId))]
        const users = userIds.length
          ? await this.prisma.user.findMany({
              where: { id: { in: userIds } },
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                deactivatedAt: true,
              },
            })
          : []
        const userById = new Map(users.map((u) => [u.id, u]))

        return memberships.map((membership) => {
          const user = userById.get(membership.userId)
          return {
            id: membership.userId,
            // Ne devrait jamais manquer (la ligne `EstablishmentMembership` vient d'être lue) —
            // nommé plutôt que silencieux, voir le même choix sur `UserDomain.searchByEmail`.
            email: user?.email ?? UNRESOLVED_ACCOUNT_EMAIL,
            firstName: user?.firstName ?? null,
            lastName: user?.lastName ?? null,
            role: membership.role,
            createdAt: membership.createdAt,
            deactivatedAt: user?.deactivatedAt ?? null,
          }
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'EstablishmentMembership',
        error: err,
      })
    }
  }

  // Le journal d'activité de l'établissement (spec §6.2), borné — voir
  // `ACTIVITY_LOG_DETAIL_LIMIT`. Aucune identité de patient : les colonnes `userFirstName`/
  // `userLastName` du modèle désignent l'AUTEUR de l'action (un membre du personnel), jamais un
  // patient — `entityID` peut être l'identifiant d'un patient, un identifiant copiable comme la
  // spec §3.4 les autorise tous, jamais son nom.
  async activityLogFor(
    establishmentId: string,
  ): Promise<ActivityLogEntityRepo[]> {
    try {
      return await this.tenantContext.runAsSuperAdmin(async () => {
        return await this.prisma.activityLog.findMany({
          where: { establishmentId },
          orderBy: { createdAt: 'desc' },
          take: ACTIVITY_LOG_DETAIL_LIMIT,
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ActivityLog',
        error: err,
      })
    }
  }
}

export { EstablishmentRepository }
