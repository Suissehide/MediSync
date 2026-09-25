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
  // Dernier normalizer de la chaîne (`error.handler.ts`) : il ne voit une erreur que si aucun
  // normalizer plus spécifique (Prisma connu, Fastify, Boom) ne l'a reconnue. C'est donc, par
  // construction, une erreur INATTENDUE — jamais un 400/404/409 délibéré, ceux-là sont déjà
  // normalisés en amont et n'ont pas la forme d'un `Error` nu ici (`boomErrorNormalizer` renvoie
  // un objet litteral, pas une instance d'`Error`).
  // Le message d'une erreur inattendue (une `Error`/`PrismaClientValidationError` qui a échappé à
  // tout `catch`, task-5-re-review-3.md C1) peut recopier integralement les arguments de l'appel
  // qui a echoue — colonnes cliniques et identifiant de patient compris. On ne le renvoie donc
  // JAMAIS tel quel, ni au client ni au journal (ce meme objet alimente les deux, voir
  // `error.handler.ts`) : seul un statut explicite, qui n'est qu'un nombre, est repris.
  const statusCode = statusCodeOf(error)
  return {
    error: defaultErrorResponse.error,
    message: defaultErrorResponse.message,
    ...(statusCode === undefined ? {} : { statusCode }),
  }
}

export { defaultErrorResponse, errorNormalizer }
