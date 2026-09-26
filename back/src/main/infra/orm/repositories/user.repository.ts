import type { IocContainer } from '../../../types/application/ioc'
import type { PrimaTransactionClient } from '../../../types/infra/orm/client'
import type {
  UserCreateEntityRepo,
  UserEntityRepo,
  UserProfileUpdateRepo,
  UserRepositoryInterface,
  UserWithMemberships,
} from '../../../types/infra/orm/repositories/user.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import { hashPassword } from '../../../utils/hash'
import type { PostgresPrismaClient } from '../postgres-client'

// Inclusion de l'arbre des appartenances (établissements puis services).
// Autorisée par le garde-fou tenant uniquement sur un findUnique(OrThrow) :
// voir GLOBAL_TENANT_RELATIONS dans tenant-guard.ts.
const membershipsInclude = {
  establishmentMemberships: {
    include: {
      establishment: true,
      serviceMemberships: { include: { service: true } },
    },
  },
} as const

class UserRepository implements UserRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  async findByID(userID: string): Promise<UserWithMemberships> {
    try {
      return await this.prisma.user.findUniqueOrThrow({
        where: { id: userID },
        include: membershipsInclude,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  async findByEmail(email: string): Promise<UserEntityRepo> {
    try {
      return await this.prisma.user.findUniqueOrThrow({
        where: { email },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  async create(
    input: UserCreateEntityRepo,
    client: PrimaTransactionClient = this.prisma,
  ): Promise<UserEntityRepo> {
    const { password, ...user } = input
    const { hash, salt } = hashPassword(password)
    try {
      return await client.user.create({
        data: {
          ...user,
          salt,
          password: hash,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  async updateProfile(
    userID: string,
    params: UserProfileUpdateRepo,
  ): Promise<UserEntityRepo> {
    try {
      return await this.prisma.user.update({
        where: { id: userID },
        data: params,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  async updatePassword(userID: string, password: string): Promise<void> {
    const { hash, salt } = hashPassword(password)
    try {
      await this.prisma.user.update({
        where: { id: userID },
        data: { password: hash, salt },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  // `client` optionnel (tâche 11, étape 4a) : `UserDomain.bootstrapSuperAdmin` l'appelle sous
  // transaction, avec `grantSuperAdmin` et l'écriture d'`ActivityLog` — voir le commentaire sur
  // cette méthode. Les appelants existants (membership.domain.ts) ne le fournissent pas et
  // retombent sur `this.prisma`, sans changement de comportement.
  async setDeactivated(
    userID: string,
    at: Date | null,
    client: PrimaTransactionClient = this.prisma,
  ): Promise<UserEntityRepo> {
    try {
      return await client.user.update({
        where: { id: userID },
        data: { deactivatedAt: at },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  // Tâche 7 : posée sur le chemin de connexion (`AuthDomain.signIn`), qui n'a aucun contexte de
  // tenant ni de superadmin — `User` est global, cette écriture n'a donc rien à encadrer (voir
  // le commentaire au-dessus de `SUPERADMIN_GLOBAL_OPERATIONS`, tenant-guard.ts : PAS `update`
  // pour cette raison précise).
  async recordLogin(userID: string, at: Date): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userID },
        data: { lastLoginAt: at },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  // Tâche 11 (étape 4a) : appelée uniquement par `UserDomain.bootstrapSuperAdmin`, elle-même
  // encadrée en mode système (`tenantContext`, voir ce fichier) — seul appelant, hors de toute
  // requête HTTP. `client` optionnel, même motif que `setDeactivated` ci-dessus : les deux, plus
  // l'écriture d'`ActivityLog`, partagent une seule transaction (tour de correction 1, Important
  // n°1 — sans elle, une promotion pouvait rester acquise en base alors que sa ligne de journal
  // échouait, perdue sans recours puisque l'idempotence de `bootstrapSuperAdmin` empêche ensuite
  // tout second appel de rejouer cette branche).
  async grantSuperAdmin(
    userID: string,
    client: PrimaTransactionClient = this.prisma,
  ): Promise<UserEntityRepo> {
    try {
      return await client.user.update({
        where: { id: userID },
        data: { isSuperAdmin: true },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }
}

export { UserRepository }
