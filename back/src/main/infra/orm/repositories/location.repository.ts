import type { IocContainer } from '../../../types/application/ioc'
import type {
  LocationCreateEntityRepo,
  LocationEntityRepo,
  LocationRepositoryInterface,
  LocationUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/location.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class LocationRepository implements LocationRepositoryInterface {
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

  findAll(): Promise<LocationEntityRepo[]> {
    return this.prisma.location.findMany({ where: this.scope })
  }

  async findByID(locationID: string): Promise<LocationEntityRepo> {
    try {
      return await this.prisma.location.findUniqueOrThrow({
        where: { id_serviceId: { id: locationID, serviceId: this.scope.serviceId } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Location',
        error: err,
      })
    }
  }

  async create(
    locationCreateParams: LocationCreateEntityRepo,
  ): Promise<LocationEntityRepo> {
    try {
      return await this.prisma.location.create({
        data: { name: locationCreateParams.name, ...this.scope },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Location',
        error: err,
      })
    }
  }

  async update(
    locationID: string,
    locationUpdateParams: LocationUpdateEntityRepo,
  ): Promise<LocationEntityRepo> {
    try {
      return await this.prisma.location.update({
        where: { id_serviceId: { id: locationID, serviceId: this.scope.serviceId } },
        data: { name: locationUpdateParams.name },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Location',
        error: err,
      })
    }
  }

  async delete(locationID: string): Promise<LocationEntityRepo> {
    try {
      return await this.prisma.location.delete({
        where: { id_serviceId: { id: locationID, serviceId: this.scope.serviceId } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Location',
        error: err,
      })
    }
  }
}

export { LocationRepository }
