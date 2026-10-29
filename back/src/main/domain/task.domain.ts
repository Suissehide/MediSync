import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  TaskCreateDomain,
  TaskDomainInterface,
  TaskDTO,
} from '../types/domain/task.domain.interface'
import type { MembershipRepositoryInterface } from '../types/infra/orm/repositories/membership.repository.interface'
import type { SoignantRepositoryInterface } from '../types/infra/orm/repositories/soignant.repository.interface'
import type {
  TaskEntityRepo,
  TaskRepositoryInterface,
} from '../types/infra/orm/repositories/task.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'
import { allows } from '../utils/notification-prefs'

const DONE_WINDOW_MS = 30 * 86_400_000

class TaskDomain implements TaskDomainInterface {
  private readonly taskRepository: TaskRepositoryInterface
  private readonly membershipRepository: MembershipRepositoryInterface
  private readonly soignantRepository: SoignantRepositoryInterface
  private readonly userRepository: UserRepositoryInterface
  private readonly tenantContext: TenantContextInterface

  constructor({
    taskRepository,
    membershipRepository,
    soignantRepository,
    userRepository,
    tenantContext,
  }: IocContainer) {
    this.taskRepository = taskRepository
    this.membershipRepository = membershipRepository
    this.soignantRepository = soignantRepository
    this.userRepository = userRepository
    this.tenantContext = tenantContext
  }

  async findAll(): Promise<TaskDTO[]> {
    return this.toDTOs(
      await this.taskRepository.findAll(new Date(Date.now() - DONE_WINDOW_MS)),
    )
  }

  async create(input: TaskCreateDomain): Promise<TaskDTO> {
    const { userId } = this.tenantContext.current()
    const requestedAssignees = [...new Set(input.assigneeIds)]
    const requestedSoignants = [...new Set(input.soignantIds)]
    const members =
      requestedAssignees.length > 0 || requestedSoignants.length > 0
        ? await this.membershipRepository.findServiceMembers()
        : []
    if (requestedAssignees.length > 0) {
      const eligible = new Set(
        members
          .filter(
            (m) =>
              m.role !== 'LECTURE' &&
              m.establishmentMembership.user.deactivatedAt === null,
          )
          .map((m) => m.establishmentMembership.user.id),
      )
      if (requestedAssignees.some((id) => !eligible.has(id))) {
        throw Boom.badRequest(
          'Assignee is not an active member of this service',
        )
      }
    }
    if (requestedSoignants.length > 0) {
      const actifs = new Set(
        (await this.soignantRepository.findAll(false)).map((s) => s.id),
      )
      if (requestedSoignants.some((id) => !actifs.has(id))) {
        throw Boom.badRequest(
          'Soignant is not an active soignant of this service',
        )
      }
    }
    if (
      input.patientId &&
      !(await this.taskRepository.isPatientInService(input.patientId))
    ) {
      throw Boom.badRequest('Patient is not followed in this service')
    }
    // Destinataires MENTION : les personnes taguees, plus les membres actifs hors LECTURE qui
    // incarnent un des metiers tagues — deduplique, l'auteur jamais notifie de sa propre tache.
    const soignantRecipientIds = members
      .filter(
        (m) =>
          m.role !== 'LECTURE' &&
          m.establishmentMembership.user.deactivatedAt === null &&
          m.soignantId !== null &&
          requestedSoignants.includes(m.soignantId),
      )
      .map((m) => m.establishmentMembership.user.id)
    const candidateIds = [
      ...new Set([...requestedAssignees, ...soignantRecipientIds]),
    ].filter((id) => id !== userId)
    // MENTION obeit aussi a la preference `mention` (spec etape 2).
    const { serviceId } = this.tenantContext.scope()
    const prefs =
      await this.userRepository.findNotificationPrefsMany(candidateIds)
    const notifyUserIds = candidateIds.filter((id) => {
      const p = prefs.get(id)
      return p ? allows(p, 'MENTION', serviceId) : true
    })
    const task = await this.taskRepository.createWithMentions({
      text: input.text,
      authorId: userId,
      assigneeIds:
        requestedAssignees.length > 0 || requestedSoignants.length > 0
          ? requestedAssignees
          : [userId],
      soignantIds: requestedSoignants,
      notifyUserIds,
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
      soignantIds: t.soignants.map((s) => s.soignantId),
      patient: (t.patientId && patients.get(t.patientId)) || null,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      doneAt: t.doneAt,
      createdAt: t.createdAt,
    }))
  }
}

export { TaskDomain }
