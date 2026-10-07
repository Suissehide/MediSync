import type { IocContainer } from '../../../types/application/ioc'
import type {
  SoignantCreateEntityRepo,
  SoignantEntityRepo,
  SoignantRepositoryInterface,
  SoignantUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/soignant.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class SoignantRepository implements SoignantRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  // Modele de service depuis le 2026-09-29 (migration `soignants_salles_par_service`) : chaque
  // service tient sa propre liste. `scope()` porte serviceId ET establishmentId ; il leve hors
  // d'un contexte de service.
  private get scope() {
    return this.tenantContext.scope()
  }

  findAll(archived = false): Promise<SoignantEntityRepo[]> {
    return this.prisma.soignant.findMany({
      where: { ...this.scope, archivedAt: archived ? { not: null } : null },
    })
  }

  // Ne filtre pas les archivees, volontairement : les domaines s'en servent pour
  // valider la cible d'une reference. Filtrer ici casserait le simple
  // reenregistrement d'une ligne qui en porte deja une archivee.
  async findByID(soignantID: string): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.findUniqueOrThrow({
        where: {
          id_serviceId: { id: soignantID, serviceId: this.scope.serviceId },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Soignant',
        error: err,
      })
    }
  }

  async create(
    soignantCreateParams: SoignantCreateEntityRepo,
  ): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.create({
        data: { ...soignantCreateParams, ...this.scope },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Soignant',
        error: err,
      })
    }
  }

  async update(
    soignantID: string,
    { archived, ...soignantUpdateParams }: SoignantUpdateEntityRepo,
  ): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.update({
        where: {
          id_serviceId: { id: soignantID, serviceId: this.scope.serviceId },
        },
        data: {
          ...soignantUpdateParams,
          ...(archived !== undefined && {
            archivedAt: archived ? new Date() : null,
          }),
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Soignant',
        error: err,
      })
    }
  }
}

export { SoignantRepository }
