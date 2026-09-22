import type { IocContainer } from '../../../types/application/ioc'
import type {
  DiagnosticEducatifCreateEntity,
  DiagnosticEducatifEntity,
  DiagnosticEducatifUpdateEntity,
} from '../../../types/domain/diagnosticEducatif.domain.interface'
import type { DiagnosticEducatifRepositoryInterface } from '../../../types/infra/orm/repositories/diagnosticEducatif.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class DiagnosticEducatifRepository implements DiagnosticEducatifRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  findByPatientID(patientId: string): Promise<DiagnosticEducatifEntity[]> {
    return this.prisma.diagnosticEducatif.findMany({
      where: { patientId, ...this.scope },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findByID(id: string): Promise<DiagnosticEducatifEntity> {
    try {
      return await this.prisma.diagnosticEducatif.findUniqueOrThrow({
        where: { id_serviceId: { id, serviceId: this.scope.serviceId } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatif',
        error: err,
      })
    }
  }

  async create(params: DiagnosticEducatifCreateEntity): Promise<DiagnosticEducatifEntity> {
    try {
      return await this.prisma.diagnosticEducatif.create({
        data: { ...params, ...this.scope },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatif',
        error: err,
      })
    }
  }

  async update(id: string, params: DiagnosticEducatifUpdateEntity): Promise<DiagnosticEducatifEntity> {
    try {
      return await this.prisma.diagnosticEducatif.update({
        where: { id_serviceId: { id, serviceId: this.scope.serviceId } },
        data: params,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatif',
        error: err,
      })
    }
  }

  async delete(id: string): Promise<DiagnosticEducatifEntity> {
    try {
      return await this.prisma.diagnosticEducatif.delete({
        where: { id_serviceId: { id, serviceId: this.scope.serviceId } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatif',
        error: err,
      })
    }
  }
}

export { DiagnosticEducatifRepository }
