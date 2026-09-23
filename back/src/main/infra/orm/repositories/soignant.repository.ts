import type { IocContainer } from '../../../types/application/ioc'
import type { SoignantRepositoryInterface } from '../../../types/infra/orm/repositories/soignant.repository.interface'
import type {
  SoignantCreateEntityRepo,
  SoignantEntityRepo,
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

  private get establishmentScope() {
    return this.tenantContext.establishmentScope()
  }

  findAll(): Promise<SoignantEntityRepo[]> {
    return this.prisma.soignant.findMany({ where: this.establishmentScope })
  }

  async findByID(soignantID: string): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.findUniqueOrThrow({
        where: { id_establishmentId: { id: soignantID, ...this.establishmentScope } },
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
        data: { ...soignantCreateParams, ...this.establishmentScope },
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
    soignantUpdateParams: SoignantUpdateEntityRepo,
  ): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.update({
        where: { id_establishmentId: { id: soignantID, ...this.establishmentScope } },
        data: soignantUpdateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Soignant',
        error: err,
      })
    }
  }

  async delete(soignantID: string): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.delete({
        where: { id_establishmentId: { id: soignantID, ...this.establishmentScope } },
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
