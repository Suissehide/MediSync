import type { Boom } from '@hapi/boom'

export interface InputErrorHandler {
  entityName: string
  error: unknown
  parentEntityName?: string
}

export interface ErrorHandlerInterface {
  boomErrorFromPrismaError(inputErrorHandler: InputErrorHandler): Boom<unknown>
}
