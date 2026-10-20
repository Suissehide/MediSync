import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  TaskCreateDomain,
  TaskDomainInterface,
  TaskDTO,
} from '../types/domain/task.domain.interface'
import type { MembershipRepositoryInterface } from '../types/infra/orm/repositories/membership.repository.interface'
import type {
  TaskEntityRepo,
  TaskRepositoryInterface,
} from '../types/infra/orm/repositories/task.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'

const DONE_WINDOW_MS = 30 * 86_400_000

class TaskDomain implements TaskDomainInterface {
  private readonly taskRepository: TaskRepositoryInterface
  private readonly membershipRepository: MembershipRepositoryInterface
  private readonly tenantContext: TenantContextInterface

  constructor({
    taskRepository,
    membershipRepository,
    tenantContext,
  }: IocContainer) {
    this.taskRepository = taskRepository
    this.membershipRepository = membershipRepository
    this.tenantContext = tenantContext
  }

  async findAll(): Promise<TaskDTO[]> {
    return this.toDTOs(
      await this.taskRepository.findAll(new Date(Date.now() - DONE_WINDOW_MS)),
    )
  }

  async create(input: TaskCreateDomain): Promise<TaskDTO> {
    const { userId } = this.tenantContext.current()
    const requested = [...new Set(input.assigneeIds)]
    if (requested.length > 0) {
      const members = await this.membershipRepository.findServiceMembers()
      const eligible = new Set(
        members
          .filter(
            (m) =>
              m.role !== 'LECTURE' &&
              m.establishmentMembership.user.deactivatedAt === null,
          )
          .map((m) => m.establishmentMembership.user.id),
      )
      if (requested.some((id) => !eligible.has(id))) {
        throw Boom.badRequest(
          'Assignee is not an active member of this service',
        )
      }
    }
    if (
      input.patientId &&
      !(await this.taskRepository.isPatientInService(input.patientId))
    ) {
      throw Boom.badRequest('Patient is not followed in this service')
    }
    const task = await this.taskRepository.createWithMentions({
      text: input.text,
      authorId: userId,
      assigneeIds: requested.length > 0 ? requested : [userId],
      patientId: input.patientId ?? null,
      dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null,
    })
    return (await this.toDTOs([task]))[0] as TaskDTO
  }

  async setDone(taskId: string, done: boolean): Promise<TaskDTO> {
    const task = await this.taskRepository.setDone(
      taskId,
      done ? new Date() : null,
    )
    return (await this.toDTOs([task]))[0] as TaskDTO
  }

  private async toDTOs(tasks: TaskEntityRepo[]): Promise<TaskDTO[]> {
    const ids = [
      ...new Set(tasks.flatMap((t) => (t.patientId ? [t.patientId] : []))),
    ]
    const patients = new Map(
      (ids.length > 0
        ? await this.taskRepository.findPatientNames(ids)
        : []
      ).map((p) => [p.id, p]),
    )
    return tasks.map((t) => ({
      id: t.id,
      text: t.text,
      authorId: t.authorId,
      assigneeIds: t.assignees.map((a) => a.userId),
      patient: (t.patientId && patients.get(t.patientId)) || null,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      doneAt: t.doneAt,
      createdAt: t.createdAt,
    }))
  }
}

export { TaskDomain }
