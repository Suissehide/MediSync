import type { IocContainer } from '../../../types/application/ioc'
import type { PrimaTransactionClient } from '../../../types/infra/orm/client'
import type { EstablishmentRepositoryInterface } from '../../../types/infra/orm/repositories/establishment.repository.interface'
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
}

export { EstablishmentRepository }
