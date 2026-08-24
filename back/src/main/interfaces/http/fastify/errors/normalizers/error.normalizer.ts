import HttpStatusCodes from 'http-status-codes'
import type {
  ErrorNormalizer,
  ErrorResponse,
} from '../../../../../types/interfaces/http/fastify/errors'

const defaultErrorResponse: ErrorResponse = {
  error: 'Internal Error',
  message: 'Unknown error',
  statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR,
}

const isError = (error: unknown): error is Error => error instanceof Error

const statusCodeOf = (error: Error): number | undefined => {
  const { statusCode } = error as Error & { statusCode?: unknown }
  return typeof statusCode === 'number' ? statusCode : undefined
}

const errorNormalizer: ErrorNormalizer = (error) => {
  if (!isError(error)) {
    return undefined
  }
  // ErrorWithProps (errorFromPrismaError) transporte le statut du Boom
  // d'origine : sans ça, un 404 ressort en 500 par défaut.
  const statusCode = statusCodeOf(error)
  return {
    error: error.name,
    message: error.message,
    ...(statusCode === undefined ? {} : { statusCode }),
  }
}

export { defaultErrorResponse, errorNormalizer }
