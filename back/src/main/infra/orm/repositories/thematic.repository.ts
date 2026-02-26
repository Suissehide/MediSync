import type { IocContainer } from '../../../types/application/ioc'
import type {
  ThematicRepositoryInterface,
  ThematicCreateEntityRepo,
  ThematicEntityRepo,
  ThematicUpdateEntityRepo,
  ThematicWithSoignantsEntityRepo,
} from '../../../types/infra/orm/repositories/thematic.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class ThematicRepository implements ThematicRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<ThematicWithSoignantsEntityRepo[]> {
    return this.prisma.thematic.findMany({ include: { soignants: true } })
  }

  async findByID(thematicID: string): Promise<ThematicWithSoignantsEntityRepo> {
    try {
      return await this.prisma.thematic.findUniqueOrThrow({
        where: { id: thematicID },
        include: { soignants: true },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Thematic',
        error: err,
      })
    }
  }

  async create(
    thematicCreateParams: ThematicCreateEntityRepo,
  ): Promise<ThematicWithSoignantsEntityRepo> {
    try {
      return await this.prisma.thematic.create({
        data: {
          name: thematicCreateParams.name,
          soignants: {
            connect: thematicCreateParams.soignantIDs.map((id) => ({ id })),
          },
        },
        include: { soignants: true },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Thematic',
        error: err,
      })
    }
  }

  async update(
    thematicID: string,
    thematicUpdateParams: ThematicUpdateEntityRepo,
  ): Promise<ThematicWithSoignantsEntityRepo> {
    try {
      return await this.prisma.thematic.update({
        where: { id: thematicID },
        data: {
          name: thematicUpdateParams.name,
          ...(thematicUpdateParams.soignantIDs && {
            soignants: {
              set: thematicUpdateParams.soignantIDs.map((id) => ({ id })),
            },
          }),
        },
        include: { soignants: true },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Thematic',
        error: err,
      })
    }
  }

  async delete(thematicID: string): Promise<ThematicEntityRepo> {
    try {
      return await this.prisma.thematic.delete({
        where: { id: thematicID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Thematic',
        error: err,
      })
    }
  }
}

export { ThematicRepository }
