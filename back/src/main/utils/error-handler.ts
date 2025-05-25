import { Boom, conflict, internal, notFound } from '@hapi/boom'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import PrismaErrorCodes from '../infra/orm/error-codes-prisma'
import type { IocContainer } from '../types/application/ioc'
import type {
  ErrorHandlerInterface,
  InputErrorHandler,
} from '../types/utils/error-handler'
import type { Logger } from '../types/utils/logger'
import {
  buildBoomError,
  type ErrorWithProps,
} from '../interfaces/http/fastify/util/boom-error-wrapper'

class ErrorHandler implements ErrorHandlerInterface {
  private readonly logger: Logger

  constructor({ logger }: IocContainer) {
    this.logger = logger
  }

  boomErrorFromPrismaError({
    entityName,
    parentEntityName,
    error,
  }: InputErrorHandler): Boom<unknown> {
    let boomError: Boom<unknown> = internal(`Something went wrong! ${error}`)
    if (error instanceof Boom) {
      boomError = error
    } else if (error instanceof PrismaClientKnownRequestError) {
      const { code, message } = error as PrismaClientKnownRequestError
      this.logger.debug(`Error Code: ${code}`)
      this.logger.debug(message)
      if (code === PrismaErrorCodes.OPERATION_DEPENDS_ON_MISSING_RECORD) {
        boomError = notFound(`${entityName} with this ID doesn't exist`)
      }
      if (code === PrismaErrorCodes.FOREIGN_KEY_CONSTRAINT_FAILED) {
        boomError = notFound(`${parentEntityName} with this ID doesn't exist`)
      }
      if (code === PrismaErrorCodes.OPERATION_FAILED_ON_UNIQUE_CONSTRAINT) {
        boomError = conflict(
          `${entityName} cannot be created because it already exists`,
        )
      }
    }
    return boomError
  }

  errorFromPrismaError(errorInput: InputErrorHandler): ErrorWithProps {
    const boomError = this.boomErrorFromPrismaError(errorInput)
    return buildBoomError(boomError)
  }
}

export { ErrorHandler }
