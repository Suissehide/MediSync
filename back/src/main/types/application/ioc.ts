import type { PostgresOrm } from '../../infra/orm/postgres-client'
import type { HttpClientInterface } from '../infra/http/http-client'
import type { Logger } from '../utils/logger'
import type { ErrorHandlerInterface } from '../utils/error-handler'
import type { HttpServer } from '../interfaces/http/server'
import type { Config } from './config'
import type { AuthDomainInterface } from '../domain/auth.domain.interface'
import type { UserRepositoryInterface } from '../infra/orm/repositories/user.repository.interface'
import type { UserDomainInterface } from '../domain/user.domain.interface'
import type { PatientRepositoryInterface } from '../infra/orm/repositories/patient.repository.interface'
import type { PatientDomainInterface } from '../domain/patient.domain.interface'
import type { PathwayDomainInterface } from '../domain/pathway.domain.interface'
import type { SlotRepositoryInterface } from '../infra/orm/repositories/slot.repository.interface'
import type { SlotDomainInterface } from '../domain/slot.domain.interface'
import type { AppointmentDomainInterface } from '../domain/appointment.domain.interface'
import type { AppointmentRepositoryInterface } from '../infra/orm/repositories/appointment.repository.interface'
import type { PathwayRepositoryInterface } from '../infra/orm/repositories/pathway.repository.interface'
import type { TodoRepositoryInterface } from '../infra/orm/repositories/todo.repository.interface'
import type { TodoDomainInterface } from '../domain/todo.domain.interface'

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
  // Pathway
  readonly pathwayDomain: PathwayDomainInterface
  readonly pathwayRepository: PathwayRepositoryInterface
  // Patient
  readonly patientDomain: PatientDomainInterface
  readonly patientRepository: PatientRepositoryInterface
  // Todo
  readonly todoDomain: TodoDomainInterface
  readonly todoRepository: TodoRepositoryInterface
}
