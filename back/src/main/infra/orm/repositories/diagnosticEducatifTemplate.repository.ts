import type { IocContainer } from '../../../types/application/ioc'
import type {
  DiagnosticEducatifTemplateCreateEntity,
  DiagnosticEducatifTemplateEntity,
  DiagnosticEducatifTemplateUpdateEntity,
} from '../../../types/domain/diagnosticEducatifTemplate.domain.interface'
import type { DiagnosticEducatifTemplateRepositoryInterface } from '../../../types/infra/orm/repositories/diagnosticEducatifTemplate.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class DiagnosticEducatifTemplateRepository implements DiagnosticEducatifTemplateRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<DiagnosticEducatifTemplateEntity[]> {
    return this.prisma.diagnosticEducatifTemplate.findMany({
      orderBy: { name: 'asc' },
    })
  }

  async findByID(id: string): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.findUniqueOrThrow({ where: { id } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'DiagnosticEducatifTemplate', error: err })
    }
  }

  async create(params: DiagnosticEducatifTemplateCreateEntity): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.create({ data: params })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'DiagnosticEducatifTemplate', error: err })
    }
  }

  async update(id: string, params: DiagnosticEducatifTemplateUpdateEntity): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.update({ where: { id }, data: params })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'DiagnosticEducatifTemplate', error: err })
    }
  }

  async delete(id: string): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.delete({ where: { id } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'DiagnosticEducatifTemplate', error: err })
    }
  }
}

export { DiagnosticEducatifTemplateRepository }
