import type { PostgresOrm } from '../../infra/orm/postgres-client'
import type { AppointmentDomainInterface } from '../domain/appointment.domain.interface'
import type { AuthDomainInterface } from '../domain/auth.domain.interface'
import type { PathwayDomainInterface } from '../domain/pathway.domain.interface'
import type { PathwayTemplateDomainInterface } from '../domain/pathwayTemplate.domain.interface'
import type { PatientDomainInterface } from '../domain/patient.domain.interface'
import type { SlotDomainInterface } from '../domain/slot.domain.interface'
import type { SoignantDomainInterface } from '../domain/soignant.domain.interface'
import type { ThematicDomainInterface } from '../domain/thematic.domain.interface'
import type { TodoDomainInterface } from '../domain/todo.domain.interface'
import type { UserDomainInterface } from '../domain/user.domain.interface'
import type { HttpClientInterface } from '../infra/http/http-client'
import type { AppointmentRepositoryInterface } from '../infra/orm/repositories/appointment.repository.interface'
import type { PathwayRepositoryInterface } from '../infra/orm/repositories/pathway.repository.interface'
import type { PathwayTemplateRepositoryInterface } from '../infra/orm/repositories/pathwayTemplate.repository.interface'
import type { PatientRepositoryInterface } from '../infra/orm/repositories/patient.repository.interface'
import type { SlotRepositoryInterface } from '../infra/orm/repositories/slot.repository.interface'
import type { SoignantRepositoryInterface } from '../infra/orm/repositories/soignant.repository.interface'
import type { ThematicRepositoryInterface } from '../infra/orm/repositories/thematic.repository.interface'
import type { TodoRepositoryInterface } from '../infra/orm/repositories/todo.repository.interface'
import type { UserRepositoryInterface } from '../infra/orm/repositories/user.repository.interface'
import type { HttpServer } from '../interfaces/http/server'
import type { ErrorHandlerInterface } from '../utils/error-handler'
import type { Logger } from '../utils/logger'
import type { Config } from './config'
import type { SlotTemplateDomainInterface } from '../domain/slotTemplate.domain.interface'
import type { SlotTemplateRepositoryInterface } from '../infra/orm/repositories/slotTemplate.repository.interface'

export interface IocContainer {
  readonly config: Config
  readonly httpServer: HttpServer
  readonly httpClient: HttpClientInterface
  readonly logger: Logger
  readonly errorHandler: ErrorHandlerInterface
  // DB
  readonly postgresOrm: PostgresOrm
  // Auth
  readonly authDomain: AuthDomainInterface
  // User
  readonly userDomain: UserDomainInterface
  readonly userRepository: UserRepositoryInterface
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
  // Soignant
  readonly soignantDomain: SoignantDomainInterface
  readonly soignantRepository: SoignantRepositoryInterface
  // Thematic
  readonly thematicDomain: ThematicDomainInterface
  readonly thematicRepository: ThematicRepositoryInterface
  // Todo
  readonly todoDomain: TodoDomainInterface
  readonly todoRepository: TodoRepositoryInterface
}
