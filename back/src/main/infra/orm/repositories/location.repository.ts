import type { IocContainer } from '../../../types/application/ioc'
import type {
  LocationRepositoryInterface,
  LocationCreateEntityRepo,
  LocationEntityRepo,
  LocationUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/location.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class LocationRepository implements LocationRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<LocationEntityRepo[]> {
    return this.prisma.location.findMany()
  }

  async findByID(locationID: string): Promise<LocationEntityRepo> {
    try {
      return await this.prisma.location.findUniqueOrThrow({
        where: { id: locationID },
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
        data: { name: locationCreateParams.name },
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
        where: { id: locationID },
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
        where: { id: locationID },
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
