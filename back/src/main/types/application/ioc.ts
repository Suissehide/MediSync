import type { PostgresOrm } from '../../infra/orm/postgres-client'
import type { ActivityLogSubscriber } from '../../services/activity-log.subscriber'
import type { AppEventBus } from '../../utils/app-event-bus'
import type { AccessLinkDomainInterface } from '../domain/accessLink.domain.interface'
import type { ActivityLogDomainInterface } from '../domain/activityLog.domain.interface'
import type { AppointmentDomainInterface } from '../domain/appointment.domain.interface'
import type { AuthDomainInterface } from '../domain/auth.domain.interface'
import type { DiagnosticEducatifDomainInterface } from '../domain/diagnosticEducatif.domain.interface'
import type { DiagnosticEducatifTemplateDomainInterface } from '../domain/diagnosticEducatifTemplate.domain.interface'
import type { EnrollmentIssueDomainInterface } from '../domain/enrollmentIssue.domain.interface'
import type { EstablishmentDomainInterface } from '../domain/establishment.domain.interface'
import type { ForbiddenWeekDomainInterface } from '../domain/forbiddenWeek.domain.interface'
import type { LocationDomainInterface } from '../domain/location.domain.interface'
import type { MembershipDomainInterface } from '../domain/membership.domain.interface'
import type { PathwayDomainInterface } from '../domain/pathway.domain.interface'
import type { PathwayTemplateDomainInterface } from '../domain/pathwayTemplate.domain.interface'
import type { PatientDomainInterface } from '../domain/patient.domain.interface'
import type { PatientAccessLogDomainInterface } from '../domain/patientAccessLog.domain.interface'
import type { PatientServiceFileDomainInterface } from '../domain/patientServiceFile.domain.interface'
import type { PlanningCycleDomainInterface } from '../domain/planningCycle.domain.interface'
import type { ServiceDomainInterface } from '../domain/service.domain.interface'
import type { SlotDomainInterface } from '../domain/slot.domain.interface'
import type { SlotTemplateDomainInterface } from '../domain/slotTemplate.domain.interface'
import type { SoignantDomainInterface } from '../domain/soignant.domain.interface'
import type { SuperAdminGrantDomainInterface } from '../domain/superAdminGrant.domain.interface'
import type { ThematicDomainInterface } from '../domain/thematic.domain.interface'
import type { TodoDomainInterface } from '../domain/todo.domain.interface'
import type { UserDomainInterface } from '../domain/user.domain.interface'
import type { HttpClientInterface } from '../infra/http/http-client'
import type { AccessGrantRepositoryInterface } from '../infra/orm/repositories/accessGrant.repository.interface'
import type { AccessLinkRepositoryInterface } from '../infra/orm/repositories/accessLink.repository.interface'
import type { ActivityLogRepositoryInterface } from '../infra/orm/repositories/activityLog.repository.interface'
import type { AppointmentRepositoryInterface } from '../infra/orm/repositories/appointment.repository.interface'
import type { DiagnosticEducatifRepositoryInterface } from '../infra/orm/repositories/diagnosticEducatif.repository.interface'
import type { DiagnosticEducatifTemplateRepositoryInterface } from '../infra/orm/repositories/diagnosticEducatifTemplate.repository.interface'
import type { EnrollmentIssueRepositoryInterface } from '../infra/orm/repositories/enrollmentIssue.repository.interface'
import type { EstablishmentRepositoryInterface } from '../infra/orm/repositories/establishment.repository.interface'
import type { ForbiddenWeekRepositoryInterface } from '../infra/orm/repositories/forbiddenWeek.repository.interface'
import type { LocationRepositoryInterface } from '../infra/orm/repositories/location.repository.interface'
import type { MembershipRepositoryInterface } from '../infra/orm/repositories/membership.repository.interface'
import type { PathwayRepositoryInterface } from '../infra/orm/repositories/pathway.repository.interface'
import type { PathwayTemplateRepositoryInterface } from '../infra/orm/repositories/pathwayTemplate.repository.interface'
import type { PatientRepositoryInterface } from '../infra/orm/repositories/patient.repository.interface'
import type { PatientAccessLogRepositoryInterface } from '../infra/orm/repositories/patientAccessLog.repository.interface'
import type { PatientServiceFileRepositoryInterface } from '../infra/orm/repositories/patientServiceFile.repository.interface'
import type { PlanningCycleRepositoryInterface } from '../infra/orm/repositories/planningCycle.repository.interface'
import type { ServiceRepositoryInterface } from '../infra/orm/repositories/service.repository.interface'
import type { SlotRepositoryInterface } from '../infra/orm/repositories/slot.repository.interface'
import type { SlotTemplateRepositoryInterface } from '../infra/orm/repositories/slotTemplate.repository.interface'
import type { SoignantRepositoryInterface } from '../infra/orm/repositories/soignant.repository.interface'
import type { ThematicRepositoryInterface } from '../infra/orm/repositories/thematic.repository.interface'
import type { TodoRepositoryInterface } from '../infra/orm/repositories/todo.repository.interface'
import type { UserRepositoryInterface } from '../infra/orm/repositories/user.repository.interface'
import type { HttpServer } from '../interfaces/http/server'
import type { ErrorHandlerInterface } from '../utils/error-handler'
import type { Logger } from '../utils/logger'
import type { TenantContextInterface } from '../utils/tenant-context'
import type { Config } from './config'

export interface IocContainer {
  readonly config: Config
  readonly httpServer: HttpServer
  readonly httpClient: HttpClientInterface
  readonly logger: Logger
  readonly errorHandler: ErrorHandlerInterface
  readonly tenantContext: TenantContextInterface
  // DB
  readonly postgresOrm: PostgresOrm
  // Auth
  readonly authDomain: AuthDomainInterface
  // User
  readonly userDomain: UserDomainInterface
  readonly userRepository: UserRepositoryInterface
  // Membership (membres d'un établissement)
  readonly membershipDomain: MembershipDomainInterface
  readonly membershipRepository: MembershipRepositoryInterface
  // Appointment
  readonly appointmentDomain: AppointmentDomainInterface
  readonly appointmentRepository: AppointmentRepositoryInterface
  // Slot
  readonly slotDomain: SlotDomainInterface
  readonly slotRepository: SlotRepositoryInterface
  // SlotTemplate
  readonly slotTemplateDomain: SlotTemplateDomainInterface
  readonly slotTemplateRepository: SlotTemplateRepositoryInterface
  // Pathway
  readonly pathwayDomain: PathwayDomainInterface
  readonly pathwayRepository: PathwayRepositoryInterface
  // PathwayTemplate
  readonly pathwayTemplateDomain: PathwayTemplateDomainInterface
  readonly pathwayTemplateRepository: PathwayTemplateRepositoryInterface
  // Patient
  readonly patientDomain: PatientDomainInterface
  readonly patientRepository: PatientRepositoryInterface
  // PatientServiceFile
  readonly patientServiceFileDomain: PatientServiceFileDomainInterface
  readonly patientServiceFileRepository: PatientServiceFileRepositoryInterface
  // Soignant
  readonly soignantDomain: SoignantDomainInterface
  readonly soignantRepository: SoignantRepositoryInterface
  // Thematic
  readonly thematicDomain: ThematicDomainInterface
  readonly thematicRepository: ThematicRepositoryInterface
  // Location
  readonly locationDomain: LocationDomainInterface
  readonly locationRepository: LocationRepositoryInterface
  // Todo
  readonly todoDomain: TodoDomainInterface
  readonly todoRepository: TodoRepositoryInterface
  // DiagnosticEducatif
  readonly diagnosticEducatifDomain: DiagnosticEducatifDomainInterface
  readonly diagnosticEducatifRepository: DiagnosticEducatifRepositoryInterface
  // DiagnosticEducatifTemplate
  readonly diagnosticEducatifTemplateDomain: DiagnosticEducatifTemplateDomainInterface
  readonly diagnosticEducatifTemplateRepository: DiagnosticEducatifTemplateRepositoryInterface
  // EnrollmentIssue
  readonly enrollmentIssueDomain: EnrollmentIssueDomainInterface
  readonly enrollmentIssueRepository: EnrollmentIssueRepositoryInterface
  // ActivityLog
  readonly appEventBus: AppEventBus
  readonly activityLogDomain: ActivityLogDomainInterface
  readonly activityLogRepository: ActivityLogRepositoryInterface
  readonly activityLogSubscriber: ActivityLogSubscriber
  // ForbiddenWeek
  readonly forbiddenWeekDomain: ForbiddenWeekDomainInterface
  readonly forbiddenWeekRepository: ForbiddenWeekRepositoryInterface
  // PlanningCycle
  readonly planningCycleDomain: PlanningCycleDomainInterface
  readonly planningCycleRepository: PlanningCycleRepositoryInterface
  // AccessGrant (octroi temporaire d'acces) — la lecture (`effectiveMemberships`,
  // domain/accessGrant.domain.ts) reste une fonction pure, sans dependance a injecter ;
  // l'ecriture (s'accorder un octroi, le revoquer) est `superAdminGrantDomain`
  // ci-dessous, seul appelant des methodes d'ecriture du meme depot.
  readonly accessGrantRepository: AccessGrantRepositoryInterface
  readonly superAdminGrantDomain: SuperAdminGrantDomainInterface
  // AccessLink (lien d'acces)
  readonly accessLinkDomain: AccessLinkDomainInterface
  readonly accessLinkRepository: AccessLinkRepositoryInterface
  // Establishment (creation d'un etablissement et de son premier administrateur)
  readonly establishmentDomain: EstablishmentDomainInterface
  readonly establishmentRepository: EstablishmentRepositoryInterface
  // Service (creation, renommage, (des)activation d'un service)
  readonly serviceDomain: ServiceDomainInterface
  readonly serviceRepository: ServiceRepositoryInterface
  // PatientAccessLog (journal des consultations) — le crochet qui appelle
  // `record` est un dispositif distinct ; ceci ne pose que le chemin d'ecriture.
  readonly patientAccessLogDomain: PatientAccessLogDomainInterface
  readonly patientAccessLogRepository: PatientAccessLogRepositoryInterface
}
