import { type Cradle, diContainer } from '@fastify/awilix'
import { type AwilixContainer, asClass, asValue } from 'awilix'
import type { Resolver } from 'awilix/lib/resolvers'
import nodemailer from 'nodemailer'

import { AccessLinkDomain } from '../../../domain/accessLink.domain'
import { ActivityLogDomain } from '../../../domain/activityLog.domain'
import { AppointmentDomain } from '../../../domain/appointment.domain'
import { AuthDomain } from '../../../domain/auth.domain'
import { DiagnosticEducatifDomain } from '../../../domain/diagnosticEducatif.domain'
import { DiagnosticEducatifTemplateDomain } from '../../../domain/diagnosticEducatifTemplate.domain'
import { EnrollmentIssueDomain } from '../../../domain/enrollmentIssue.domain'
import { EstablishmentDomain } from '../../../domain/establishment.domain'
import { ForbiddenWeekDomain } from '../../../domain/forbiddenWeek.domain'
import { LocationDomain } from '../../../domain/location.domain'
import { MembershipDomain } from '../../../domain/membership.domain'
import { PathwayDomain } from '../../../domain/pathway.domain'
import { PathwayTemplateDomain } from '../../../domain/pathwayTemplate.domain'
import { PatientDomain } from '../../../domain/patient.domain'
import { PatientAccessLogDomain } from '../../../domain/patientAccessLog.domain'
import { PatientServiceFileDomain } from '../../../domain/patientServiceFile.domain'
import { PlanningCycleDomain } from '../../../domain/planningCycle.domain'
import { ServiceDomain } from '../../../domain/service.domain'
import { SlotDomain } from '../../../domain/slot.domain'
import { SlotTemplateDomain } from '../../../domain/slotTemplate.domain'
import { SoignantDomain } from '../../../domain/soignant.domain'
import { SuperAdminGrantDomain } from '../../../domain/superAdminGrant.domain'
import { ThematicDomain } from '../../../domain/thematic.domain'
import { TodoDomain } from '../../../domain/todo.domain'
import { UserDomain } from '../../../domain/user.domain'
import { HttpClient } from '../../../infra/http/http-client'
import { PinoLogger } from '../../../infra/logger/pino/pino-logger'
import { Mailer } from '../../../infra/mail/mailer'
import { PostgresOrm } from '../../../infra/orm/postgres-client'
import { AccessGrantRepository } from '../../../infra/orm/repositories/accessGrant.repository'
import { AccessLinkRepository } from '../../../infra/orm/repositories/accessLink.repository'
import { ActivityLogRepository } from '../../../infra/orm/repositories/activityLog.repository'
import { AppointmentRepository } from '../../../infra/orm/repositories/appointment.repository'
import { DiagnosticEducatifRepository } from '../../../infra/orm/repositories/diagnosticEducatif.repository'
import { DiagnosticEducatifTemplateRepository } from '../../../infra/orm/repositories/diagnosticEducatifTemplate.repository'
import { EnrollmentIssueRepository } from '../../../infra/orm/repositories/enrollmentIssue.repository'
import { EstablishmentRepository } from '../../../infra/orm/repositories/establishment.repository'
import { ForbiddenWeekRepository } from '../../../infra/orm/repositories/forbiddenWeek.repository'
import { LocationRepository } from '../../../infra/orm/repositories/location.repository'
import { MembershipRepository } from '../../../infra/orm/repositories/membership.repository'
import { PathwayRepository } from '../../../infra/orm/repositories/pathway.repository'
import { PathwayTemplateRepository } from '../../../infra/orm/repositories/pathwayTemplate.repository'
import { PatientRepository } from '../../../infra/orm/repositories/patient.repository'
import { PatientAccessLogRepository } from '../../../infra/orm/repositories/patientAccessLog.repository'
import { PatientServiceFileRepository } from '../../../infra/orm/repositories/patientServiceFile.repository'
import { PlanningCycleRepository } from '../../../infra/orm/repositories/planningCycle.repository'
import { ServiceRepository } from '../../../infra/orm/repositories/service.repository'
import { SlotRepository } from '../../../infra/orm/repositories/slot.repository'
import { SlotTemplateRepository } from '../../../infra/orm/repositories/slotTemplate.repository'
import { SoignantRepository } from '../../../infra/orm/repositories/soignant.repository'
import { ThematicRepository } from '../../../infra/orm/repositories/thematic.repository'
import { TodoRepository } from '../../../infra/orm/repositories/todo.repository'
import { UserRepository } from '../../../infra/orm/repositories/user.repository'
import { FastifyHttpServer } from '../../../interfaces/http/fastify/fastify-http-server'
import { ActivityLogSubscriber } from '../../../services/activity-log.subscriber'
import type { Config } from '../../../types/application/config'
import type { IocContainer } from '../../../types/application/ioc'
import { AppEventBus } from '../../../utils/app-event-bus'
import { ErrorHandler } from '../../../utils/error-handler'
import { recordToString, redactSecrets } from '../../../utils/helper'
import { TenantContext } from '../../../utils/tenant-context'

declare module '@fastify/awilix' {
  interface Cradle extends IocContainer {}
}

class AwilixIocContainer {
  get instances() {
    return diContainer.cradle
  }

  constructor(config: Config) {
    // Config
    this.#registerConfig(config)
    // Logger
    const container = this.#registerLogger()
    const logger = container.resolve('logger')
    logger.debug('Initializing IoC container…')
    logger.debug(`Loaded config:\n\t${recordToString(redactSecrets(config))}`)
    // Tenant context (avant l'ORM : le garde-fou Prisma en dépend)
    this.#registerTenantContext()
    // DB
    this.#registerPrismaOrm()
    // EventBus (registered early so all domains can rely on it)
    this.#registerAppEventBus()
    // Auth
    this.#registerAuthDomain()
    // User
    this.#registerUserDomain()
    this.#registerUserRepository()
    // Membership
    this.#registerMembershipDomain()
    this.#registerMembershipRepository()
    // Appointment
    this.#registerAppointmentDomain()
    this.#registerAppointmentRepository()
    // Slot
    this.#registerSlotDomain()
    this.#registerSlotRepository()
    // SlotTemplate
    this.#registerSlotTemplateDomain()
    this.#registerSlotTemplateRepository()
    // Pathway
    this.#registerPathwayDomain()
    this.#registerPathwayRepository()
    // PathwayTemplate
    this.#registerPathwayTemplateDomain()
    this.#registerPathwayTemplateRepository()
    // Patient
    this.#registerPatientDomain()
    this.#registerPatientRepository()
    // PatientServiceFile
    this.#registerPatientServiceFileDomain()
    this.#registerPatientServiceFileRepository()
    // Soignant
    this.#registerSoignantDomain()
    this.#registerSoignantRepository()
    // Thematic
    this.#registerThematicDomain()
    this.#registerThematicRepository()
    // Location
    this.#registerLocationDomain()
    this.#registerLocationRepository()
    // Todo
    this.#registerTodoDomain()
    this.#registerTodoRepository()
    // DiagnosticEducatif
    this.#registerDiagnosticEducatifDomain()
    this.#registerDiagnosticEducatifRepository()
    // DiagnosticEducatifTemplate
    this.#registerDiagnosticEducatifTemplateDomain()
    this.#registerDiagnosticEducatifTemplateRepository()
    // EnrollmentIssue
    this.#registerEnrollmentIssueDomain()
    this.#registerEnrollmentIssueRepository()
    // Error (must be before ActivityLog subscriber which depends on userRepository -> errorHandler)
    this.registerErrorHandler()
    // ActivityLog
    this.#registerActivityLogDomain()
    this.#registerActivityLogRepository()
    this.#registerActivityLogSubscriber()
    // Force-instantiate subscriber to trigger subscriptions at startup
    diContainer.resolve('activityLogSubscriber')
    // ForbiddenWeek
    this.#registerForbiddenWeekDomain()
    this.#registerForbiddenWeekRepository()
    // PlanningCycle
    this.#registerPlanningCycleDomain()
    this.#registerPlanningCycleRepository()
    // AccessGrant
    this.#registerAccessGrantRepository()
    this.#registerSuperAdminGrantDomain()
    // Mail
    this.#registerMailer(config)
    // AccessLink
    this.#registerAccessLinkDomain()
    this.#registerAccessLinkRepository()
    // Establishment
    this.#registerEstablishmentDomain()
    this.#registerEstablishmentRepository()
    // Service
    this.#registerServiceDomain()
    this.#registerServiceRepository()
    // PatientAccessLog
    this.#registerPatientAccessLogDomain()
    this.#registerPatientAccessLogRepository()

    // Server
    this.#registerHttpServer()
    this.#registerHttpClient()

    logger.info('IoC container initialized.')
  }

  private register<T>(
    value: keyof IocContainer,
    register: Resolver<T>,
  ): AwilixContainer<Cradle> {
    return diContainer.register(value, register)
  }

  #registerConfig(config: Config): void {
    this.register('config', asValue(config))
  }

  #registerHttpClient(): void {
    this.register('httpClient', asClass(HttpClient).singleton())
  }
  #registerHttpServer(): void {
    this.register('httpServer', asClass(FastifyHttpServer).singleton())
  }

  #registerLogger(): AwilixContainer<Cradle> {
    return this.register('logger', asClass(PinoLogger).singleton())
  }

  #registerPrismaOrm(): void {
    this.register('postgresOrm', asClass(PostgresOrm).singleton())
  }

  // Tenant context
  #registerTenantContext(): void {
    this.register('tenantContext', asClass(TenantContext).singleton())
  }

  // Error
  private registerErrorHandler(): void {
    this.register('errorHandler', asClass(ErrorHandler).singleton())
  }

  // Auth
  #registerAuthDomain(): void {
    this.register('authDomain', asClass(AuthDomain).singleton())
  }

  // User
  #registerUserDomain(): void {
    this.register('userDomain', asClass(UserDomain).singleton())
  }
  #registerUserRepository(): void {
    this.register('userRepository', asClass(UserRepository).singleton())
  }

  // Membership
  #registerMembershipDomain(): void {
    this.register('membershipDomain', asClass(MembershipDomain).singleton())
  }
  #registerMembershipRepository(): void {
    this.register(
      'membershipRepository',
      asClass(MembershipRepository).singleton(),
    )
  }

  // Appointment
  #registerAppointmentDomain(): void {
    this.register('appointmentDomain', asClass(AppointmentDomain).singleton())
  }
  #registerAppointmentRepository(): void {
    this.register(
      'appointmentRepository',
      asClass(AppointmentRepository).singleton(),
    )
  }

  // Slot
  #registerSlotDomain(): void {
    this.register('slotDomain', asClass(SlotDomain).singleton())
  }
  #registerSlotRepository(): void {
    this.register('slotRepository', asClass(SlotRepository).singleton())
  }

  // Slot
  #registerSlotTemplateDomain(): void {
    this.register('slotTemplateDomain', asClass(SlotTemplateDomain).singleton())
  }
  #registerSlotTemplateRepository(): void {
    this.register(
      'slotTemplateRepository',
      asClass(SlotTemplateRepository).singleton(),
    )
  }

  // Pathway
  #registerPathwayDomain(): void {
    this.register('pathwayDomain', asClass(PathwayDomain).singleton())
  }
  #registerPathwayRepository(): void {
    this.register('pathwayRepository', asClass(PathwayRepository).singleton())
  }

  // PathwayTemplate
  #registerPathwayTemplateDomain(): void {
    this.register(
      'pathwayTemplateDomain',
      asClass(PathwayTemplateDomain).singleton(),
    )
  }
  #registerPathwayTemplateRepository(): void {
    this.register(
      'pathwayTemplateRepository',
      asClass(PathwayTemplateRepository).singleton(),
    )
  }

  // Patient
  #registerPatientDomain(): void {
    this.register('patientDomain', asClass(PatientDomain).singleton())
  }
  #registerPatientRepository(): void {
    this.register('patientRepository', asClass(PatientRepository).singleton())
  }

  // PatientServiceFile
  #registerPatientServiceFileDomain(): void {
    this.register(
      'patientServiceFileDomain',
      asClass(PatientServiceFileDomain).singleton(),
    )
  }
  #registerPatientServiceFileRepository(): void {
    this.register(
      'patientServiceFileRepository',
      asClass(PatientServiceFileRepository).singleton(),
    )
  }

  // Soignant
  #registerSoignantDomain(): void {
    this.register('soignantDomain', asClass(SoignantDomain).singleton())
  }
  #registerSoignantRepository(): void {
    this.register('soignantRepository', asClass(SoignantRepository).singleton())
  }

  // Thematic
  #registerThematicDomain(): void {
    this.register('thematicDomain', asClass(ThematicDomain).singleton())
  }
  #registerThematicRepository(): void {
    this.register('thematicRepository', asClass(ThematicRepository).singleton())
  }

  // Location
  #registerLocationDomain(): void {
    this.register('locationDomain', asClass(LocationDomain).singleton())
  }
  #registerLocationRepository(): void {
    this.register('locationRepository', asClass(LocationRepository).singleton())
  }

  // Service
  #registerServiceDomain(): void {
    this.register('serviceDomain', asClass(ServiceDomain).singleton())
  }
  #registerServiceRepository(): void {
    this.register('serviceRepository', asClass(ServiceRepository).singleton())
  }

  // PatientAccessLog
  #registerPatientAccessLogDomain(): void {
    this.register(
      'patientAccessLogDomain',
      asClass(PatientAccessLogDomain).singleton(),
    )
  }
  #registerPatientAccessLogRepository(): void {
    this.register(
      'patientAccessLogRepository',
      asClass(PatientAccessLogRepository).singleton(),
    )
  }

  // Todo
  #registerTodoDomain(): void {
    this.register('todoDomain', asClass(TodoDomain).singleton())
  }
  #registerTodoRepository(): void {
    this.register('todoRepository', asClass(TodoRepository).singleton())
  }

  // DiagnosticEducatif
  #registerDiagnosticEducatifDomain(): void {
    this.register(
      'diagnosticEducatifDomain',
      asClass(DiagnosticEducatifDomain).singleton(),
    )
  }
  #registerDiagnosticEducatifRepository(): void {
    this.register(
      'diagnosticEducatifRepository',
      asClass(DiagnosticEducatifRepository).singleton(),
    )
  }
  // DiagnosticEducatifTemplate
  #registerDiagnosticEducatifTemplateDomain(): void {
    this.register(
      'diagnosticEducatifTemplateDomain',
      asClass(DiagnosticEducatifTemplateDomain).singleton(),
    )
  }
  #registerDiagnosticEducatifTemplateRepository(): void {
    this.register(
      'diagnosticEducatifTemplateRepository',
      asClass(DiagnosticEducatifTemplateRepository).singleton(),
    )
  }

  // EnrollmentIssue
  #registerEnrollmentIssueDomain(): void {
    this.register(
      'enrollmentIssueDomain',
      asClass(EnrollmentIssueDomain).singleton(),
    )
  }
  #registerEnrollmentIssueRepository(): void {
    this.register(
      'enrollmentIssueRepository',
      asClass(EnrollmentIssueRepository).singleton(),
    )
  }

  // ActivityLog
  #registerAppEventBus(): void {
    this.register('appEventBus', asClass(AppEventBus).singleton())
  }
  #registerActivityLogDomain(): void {
    this.register('activityLogDomain', asClass(ActivityLogDomain).singleton())
  }
  #registerActivityLogRepository(): void {
    this.register(
      'activityLogRepository',
      asClass(ActivityLogRepository).singleton(),
    )
  }
  #registerActivityLogSubscriber(): void {
    this.register(
      'activityLogSubscriber',
      asClass(ActivityLogSubscriber).singleton(),
    )
  }

  // ForbiddenWeek
  #registerForbiddenWeekDomain(): void {
    this.register(
      'forbiddenWeekDomain',
      asClass(ForbiddenWeekDomain).singleton(),
    )
  }
  #registerForbiddenWeekRepository(): void {
    this.register(
      'forbiddenWeekRepository',
      asClass(ForbiddenWeekRepository).singleton(),
    )
  }

  // PlanningCycle
  #registerPlanningCycleDomain(): void {
    this.register(
      'planningCycleDomain',
      asClass(PlanningCycleDomain).singleton(),
    )
  }

  #registerPlanningCycleRepository(): void {
    this.register(
      'planningCycleRepository',
      asClass(PlanningCycleRepository).singleton(),
    )
  }

  // AccessGrant
  #registerAccessGrantRepository(): void {
    this.register(
      'accessGrantRepository',
      asClass(AccessGrantRepository).singleton(),
    )
  }
  #registerSuperAdminGrantDomain(): void {
    this.register(
      'superAdminGrantDomain',
      asClass(SuperAdminGrantDomain).singleton(),
    )
  }

  // Mail
  #registerMailer(config: Config): void {
    const transport = config.smtpHost
      ? nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpSecure,
          auth: config.smtpUser
            ? { user: config.smtpUser, pass: config.smtpPass }
            : undefined,
        })
      : null
    this.register('mailTransport', asValue(transport))
    this.register('mailer', asClass(Mailer).singleton())
  }

  // AccessLink
  #registerAccessLinkDomain(): void {
    this.register('accessLinkDomain', asClass(AccessLinkDomain).singleton())
  }
  #registerAccessLinkRepository(): void {
    this.register(
      'accessLinkRepository',
      asClass(AccessLinkRepository).singleton(),
    )
  }

  // Establishment
  #registerEstablishmentDomain(): void {
    this.register(
      'establishmentDomain',
      asClass(EstablishmentDomain).singleton(),
    )
  }
  #registerEstablishmentRepository(): void {
    this.register(
      'establishmentRepository',
      asClass(EstablishmentRepository).singleton(),
    )
  }
}

export { AwilixIocContainer }
