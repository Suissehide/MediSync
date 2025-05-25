import { type Cradle, diContainer } from '@fastify/awilix'
import { type AwilixContainer, asClass, asValue } from 'awilix'
import type { Resolver } from 'awilix/lib/resolvers'
import { HttpClient } from '../../../infra/http/http-client'
import { PinoLogger } from '../../../infra/logger/pino/pino-logger'
import { PostgresOrm } from '../../../infra/orm/postgres-client'
import { FastifyHttpServer } from '../../../interfaces/http/fastify/fastify-http-server'
import type { Config } from '../../../types/application/config'
import type { IocContainer } from '../../../types/application/ioc'
import { recordToString } from '../../../utils/helper'
import { AuthDomain } from '../../../domain/auth.domain'
import { UserRepository } from '../../../infra/orm/repositories/user.repository'
import { UserDomain } from '../../../domain/user.domain'
import { PatientDomain } from '../../../domain/patient.domain'
import { PathwayDomain } from '../../../domain/pathway.domain'
import { SlotDomain } from '../../../domain/slot.domain'
import { AppointmentDomain } from '../../../domain/appointment.domain'
import { SlotRepository } from '../../../infra/orm/repositories/slot.repository'
import { PathwayRepository } from '../../../infra/orm/repositories/pathway.repository'
import { PatientRepository } from '../../../infra/orm/repositories/patient.repository'
import { AppointmentRepository } from '../../../infra/orm/repositories/appointment.repository'
import { ErrorHandler } from '../../../utils/error-handler'
import { TodoRepository } from '../../../infra/orm/repositories/todo.repository'
import { TodoDomain } from '../../../domain/todo.domain'

declare module '@fastify/awilix' {
  interface Cradle extends IocContainer {}
}

class AwilixIocContainer {
  get instances() {
    return diContainer.cradle
  }

  constructor(config: Config) {
    const container = this.#registerLogger()
    this.#registerConfig(config)
    const logger = container.resolve('logger')
    logger.debug('Initializing IoC container…')
    logger.debug(`Loaded config:\n\t${recordToString(config)}`)
    // DB
    this.#registerPrismaOrm()
    // Server
    this.#registerHttpServer()
    this.#registerHttpClient()
    // Error
    this.registerErrorHandler()
    // Auth
    this.#registerAuthDomain()
    // User
    this.#registerUserDomain()
    this.#registerUserRepository()
    // Appointment
    this.#registerAppointmentDomain()
    this.#registerAppointmentRepository()
    // Slot
    this.#registerSlotDomain()
    this.#registerSlotRepository()
    // Pathway
    this.#registerPathwayDomain()
    this.#registerPathwayRepository()
    // Patient
    this.#registerPatientDomain()
    this.#registerPatientRepository()
    // Patient
    this.#registerTodoDomain()
    this.#registerTodoRepository()

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

  // Pathway
  #registerPathwayDomain(): void {
    this.register('pathwayDomain', asClass(PathwayDomain).singleton())
  }
  #registerPathwayRepository(): void {
    this.register('pathwayRepository', asClass(PathwayRepository).singleton())
  }

  // Patient
  #registerPatientDomain(): void {
    this.register('patientDomain', asClass(PatientDomain).singleton())
  }
  #registerPatientRepository(): void {
    this.register('patientRepository', asClass(PatientRepository).singleton())
  }

  // Todo
  #registerTodoDomain(): void {
    this.register('todoDomain', asClass(TodoDomain).singleton())
  }
  #registerTodoRepository(): void {
    this.register('todoRepository', asClass(TodoRepository).singleton())
  }
}

export { AwilixIocContainer }
