import type { IocContainer } from '../../../types/application/ioc'
import type {
  EnrollmentIssueCreateEntityRepo,
  EnrollmentIssueEntityRepo,
  EnrollmentIssueRepositoryInterface,
} from '../../../types/infra/orm/repositories/enrollmentIssue.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class EnrollmentIssueRepository implements EnrollmentIssueRepositoryInterface {
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

  findByPatientID(patientID: string): Promise<EnrollmentIssueEntityRepo[]> {
    return this.prisma.enrollmentIssue.findMany({
      where: { patientId: patientID, ...this.scope },
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(
    patientID: string,
    issues: EnrollmentIssueCreateEntityRepo[],
  ): Promise<void> {
    await this.prisma.enrollmentIssue.createMany({
      data: issues.map((issue) => ({ ...issue, patientId: patientID, ...this.scope })),
    })
  }

  async delete(issueID: string): Promise<void> {
    try {
      await this.prisma.enrollmentIssue.delete({
        where: { id_serviceId: { id: issueID, serviceId: this.scope.serviceId } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'EnrollmentIssue',
        error: err,
      })
    }
  }
}

export { EnrollmentIssueRepository }
