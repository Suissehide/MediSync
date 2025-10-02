import { type Cradle, diContainer } from '@fastify/awilix'
import { type AwilixContainer, asClass, asValue } from 'awilix'
import type { Resolver } from 'awilix/lib/resolvers'
import { AppointmentDomain } from '../../../domain/appointment.domain'
import { AuthDomain } from '../../../domain/auth.domain'
import { PathwayDomain } from '../../../domain/pathway.domain'
import { PathwayTemplateDomain } from '../../../domain/pathwayTemplate.domain'
import { PatientDomain } from '../../../domain/patient.domain'
import { SlotDomain } from '../../../domain/slot.domain'
import { SoignantDomain } from '../../../domain/soignant.domain'
import { TodoDomain } from '../../../domain/todo.domain'
import { UserDomain } from '../../../domain/user.domain'
import { HttpClient } from '../../../infra/http/http-client'
import { PinoLogger } from '../../../infra/logger/pino/pino-logger'
import { PostgresOrm } from '../../../infra/orm/postgres-client'
import { AppointmentRepository } from '../../../infra/orm/repositories/appointment.repository'
import { PathwayRepository } from '../../../infra/orm/repositories/pathway.repository'
import { PathwayTemplateRepository } from '../../../infra/orm/repositories/pathwayTemplate.repository'
import { PatientRepository } from '../../../infra/orm/repositories/patient.repository'
import { SlotRepository } from '../../../infra/orm/repositories/slot.repository'
import { SoignantRepository } from '../../../infra/orm/repositories/soignant.repository'
import { TodoRepository } from '../../../infra/orm/repositories/todo.repository'
import { UserRepository } from '../../../infra/orm/repositories/user.repository'
import { FastifyHttpServer } from '../../../interfaces/http/fastify/fastify-http-server'
import type { Config } from '../../../types/application/config'
import type { IocContainer } from '../../../types/application/ioc'
import { ErrorHandler } from '../../../utils/error-handler'
import { recordToString } from '../../../utils/helper'
import { SlotTemplateDomain } from '../../../domain/slotTemplate.domain'
import { SlotTemplateRepository } from '../../../infra/orm/repositories/slotTemplate.repository'

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
    // Soignant
    this.#registerSoignantDomain()
    this.#registerSoignantRepository()
    // Todo
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

  // Soignant
  #registerSoignantDomain(): void {
    this.register('soignantDomain', asClass(SoignantDomain).singleton())
  }
  #registerSoignantRepository(): void {
    this.register('soignantRepository', asClass(SoignantRepository).singleton())
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
