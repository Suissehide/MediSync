import type { IocContainer } from '../types/application/ioc'
import type { ActivityLogRepositoryInterface } from '../types/infra/orm/repositories/activityLog.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import type { AppEventBus } from '../utils/app-event-bus'
import type { Logger } from '../types/utils/logger'

class ActivityLogSubscriber {
  private readonly appEventBus: AppEventBus
  private readonly activityLogRepository: ActivityLogRepositoryInterface
  private readonly userRepository: UserRepositoryInterface
  private readonly logger: Logger

  constructor({
    appEventBus,
    activityLogRepository,
    userRepository,
    logger,
  }: IocContainer) {
    this.appEventBus = appEventBus
    this.activityLogRepository = activityLogRepository
    this.userRepository = userRepository
    this.logger = logger
    this.#subscribe()
  }

  #subscribe(): void {
    this.appEventBus.on('patient.created', (p) =>
      this.#log('patient.created', 'patient', p.userID, p.patientId))
    this.appEventBus.on('patient.updated', (p) =>
      this.#log('patient.updated', 'patient', p.userID, p.patientId))
    this.appEventBus.on('patient.deleted', (p) =>
      this.#log('patient.deleted', 'patient', p.userID, p.patientId))
    this.appEventBus.on('patient.enrolled', (p) =>
      this.#log('patient.enrolled', 'patient', p.userID, p.patientId))
    this.appEventBus.on('diagnostic.created', (p) =>
      this.#log('diagnostic.created', 'diagnostic', p.userID, p.diagnosticId))
    this.appEventBus.on('diagnostic.updated', (p) =>
      this.#log('diagnostic.updated', 'diagnostic', p.userID, p.diagnosticId))
    this.appEventBus.on('appointment.created', (p) =>
      this.#log('appointment.created', 'appointment', p.userID, p.appointmentId))
    this.appEventBus.on('appointment.updated', (p) =>
      this.#log('appointment.updated', 'appointment', p.userID, p.appointmentId))
  }

  async #log(
    action: string,
    entityType: string,
    userID: string,
    entityID: string,
  ): Promise<void> {
    try {
      const user = await this.userRepository.findByID(userID).catch(() => null)
      await this.activityLogRepository.create({
        userID,
        userFirstName: user?.firstName ?? null,
        userLastName: user?.lastName ?? null,
        action,
        entityType,
        entityID,
      })
    } catch (err) {
      this.logger.error(`ActivityLog: failed to log ${action}: ${err}`)
    }
  }
}

export { ActivityLogSubscriber }
