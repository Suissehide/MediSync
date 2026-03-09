import type { IocContainer } from '../../../types/application/ioc'
import type {
  ForbiddenWeekCreateEntityRepo,
  ForbiddenWeekEntityRepo,
  ForbiddenWeekRepositoryInterface,
} from '../../../types/infra/orm/repositories/forbiddenWeek.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class ForbiddenWeekRepository implements ForbiddenWeekRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<ForbiddenWeekEntityRepo[]> {
    return this.prisma.forbiddenWeek.findMany({
      orderBy: { startOfWeek: 'asc' },
    })
  }

  async create(params: ForbiddenWeekCreateEntityRepo): Promise<ForbiddenWeekEntityRepo> {
    try {
      return await this.prisma.forbiddenWeek.create({ data: params })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ForbiddenWeek',
        error: err,
      })
    }
  }

  async delete(id: string): Promise<ForbiddenWeekEntityRepo> {
    try {
      return await this.prisma.forbiddenWeek.delete({ where: { id } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ForbiddenWeek',
        error: err,
      })
    }
  }
}

export { ForbiddenWeekRepository }
