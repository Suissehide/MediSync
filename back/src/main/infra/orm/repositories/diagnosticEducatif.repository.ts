import type { IocContainer } from '../../../types/application/ioc'
import type {
  DiagnosticEducatifCreateEntity,
  DiagnosticEducatifEntity,
  DiagnosticEducatifUpdateEntity,
} from '../../../types/domain/diagnosticEducatif.domain.interface'
import type { DiagnosticEducatifRepositoryInterface } from '../../../types/infra/orm/repositories/diagnosticEducatif.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class DiagnosticEducatifRepository implements DiagnosticEducatifRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findByPatientID(patientId: string): Promise<DiagnosticEducatifEntity[]> {
    return this.prisma.diagnosticEducatif.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findByID(id: string): Promise<DiagnosticEducatifEntity> {
    try {
      return await this.prisma.diagnosticEducatif.findUniqueOrThrow({
        where: { id },
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
      return await this.prisma.diagnosticEducatif.create({ data: params })
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
        where: { id },
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
      return await this.prisma.diagnosticEducatif.delete({ where: { id } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatif',
        error: err,
      })
    }
  }
}

export { DiagnosticEducatifRepository }
