import type { IocContainer } from '../../../types/application/ioc'
import type {
  DiagnosticEducatifTemplateCreateEntity,
  DiagnosticEducatifTemplateEntity,
  DiagnosticEducatifTemplateUpdateEntity,
} from '../../../types/domain/diagnosticEducatifTemplate.domain.interface'
import type { DiagnosticEducatifTemplateRepositoryInterface } from '../../../types/infra/orm/repositories/diagnosticEducatifTemplate.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class DiagnosticEducatifTemplateRepository
  implements DiagnosticEducatifTemplateRepositoryInterface
{
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

  findAll(archived = false): Promise<DiagnosticEducatifTemplateEntity[]> {
    return this.prisma.diagnosticEducatifTemplate.findMany({
      where: { ...this.scope, archivedAt: archived ? { not: null } : null },
      orderBy: { name: 'asc' },
    })
  }

  // Ne filtre pas les archivees, volontairement : les domaines s'en servent pour
  // valider la cible d'une reference. Filtrer ici casserait le simple
  // reenregistrement d'une ligne qui en porte deja une archivee.
  async findByID(id: string): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.findUniqueOrThrow({
        where: { id_serviceId: { id, serviceId: this.scope.serviceId } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatifTemplate',
        error: err,
      })
    }
  }

  async create(
    params: DiagnosticEducatifTemplateCreateEntity,
  ): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.create({
        data: { ...params, ...this.scope },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatifTemplate',
        error: err,
      })
    }
  }

  async update(
    id: string,
    { archived, ...params }: DiagnosticEducatifTemplateUpdateEntity,
  ): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.update({
        where: { id_serviceId: { id, serviceId: this.scope.serviceId } },
        data: {
          ...params,
          ...(archived !== undefined && {
            archivedAt: archived ? new Date() : null,
          }),
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatifTemplate',
        error: err,
      })
    }
  }
}

export { DiagnosticEducatifTemplateRepository }
