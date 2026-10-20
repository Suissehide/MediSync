import type { IocContainer } from '../../../types/application/ioc'
import type {
  PatientName,
  TaskCreateEntityRepo,
  TaskEntityRepo,
  TaskRepositoryInterface,
} from '../../../types/infra/orm/repositories/task.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresOrm, PostgresPrismaClient } from '../postgres-client'

const include = { assignees: { select: { userId: true } } } as const

class TaskRepository implements TaskRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly postgresOrm: PostgresOrm
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.postgresOrm = postgresOrm
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  findAll(doneSince: Date): Promise<TaskEntityRepo[]> {
    return this.prisma.task.findMany({
      where: {
        ...this.scope,
        OR: [{ doneAt: null }, { doneAt: { gte: doneSince } }],
      },
      include,
      orderBy: { createdAt: 'desc' },
    })
  }

  // La tache et les notifications de mention partent ensemble ou pas du tout.
  createWithMentions(input: TaskCreateEntityRepo): Promise<TaskEntityRepo> {
    const scope = this.scope
    return this.postgresOrm.executeWithTransactionClient(async (tx) => {
      const task = await tx.task.create({
        data: {
          ...scope,
          text: input.text,
          authorId: input.authorId,
          patientId: input.patientId,
          dueDate: input.dueDate,
          // serviceId n'est pas accepte ici : il vient de la relation composite vers Task (fields: [taskId, serviceId]).
          assignees: {
            create: input.assigneeIds.map((userId) => ({
              establishmentId: scope.establishmentId,
              userId,
            })),
          },
        },
        include,
      })
      const mentionned = input.assigneeIds.filter((id) => id !== input.authorId)
      if (mentionned.length > 0) {
        await tx.notification.createMany({
          data: mentionned.map((userId) => ({
            ...scope,
            userId,
            type: 'MENTION' as const,
            payload: {
              taskId: task.id,
              authorId: input.authorId,
              text: input.text,
            },
          })),
        })
      }
      return task
    })
  }

  async setDone(taskId: string, doneAt: Date | null): Promise<TaskEntityRepo> {
    try {
      return await this.prisma.task.update({
        where: {
          id_serviceId: { id: taskId, serviceId: this.scope.serviceId },
        },
        data: { doneAt },
        include,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Task',
        error: err,
      })
    }
  }

  async isPatientInService(patientId: string): Promise<boolean> {
    return (
      (await this.prisma.patientServiceFile.count({
        where: { ...this.scope, patientId },
      })) > 0
    )
  }

  findPatientNames(patientIds: string[]): Promise<PatientName[]> {
    return this.prisma.patient.findMany({
      where: {
        id: { in: patientIds },
        establishmentId: this.scope.establishmentId,
      },
      select: { id: true, firstName: true, lastName: true },
    })
  }
}

export { TaskRepository }
