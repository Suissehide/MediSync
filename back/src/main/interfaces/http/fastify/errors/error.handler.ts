import type { Boom } from '@hapi/boom'
import { html } from 'common-tags'
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify'

import type {
  ErrorNormalizer,
  ErrorResponse,
} from '../../../../types/interfaces/http/fastify/errors'
import { pathWithoutQuery } from '../../../../utils/url-helper'
import {
  TenantContextMissingError,
  TenantScopeMissingError,
} from '../../../../utils/tenant-errors'
import {
  defaultErrorResponse,
  errorNormalizer,
} from './normalizers/error.normalizer'

const normalizeResponse = (
  error: unknown,
  customErrorNormalizers: ErrorNormalizer[],
): ErrorResponse => {
  const initialCustomError = error as Partial<ErrorResponse>
  const customError = [...customErrorNormalizers, errorNormalizer].reduce<
    Partial<ErrorResponse>
  >((acc, normalizer) => normalizer(acc) ?? acc, initialCustomError)
  return {
    ...defaultErrorResponse,
    ...customError,
  }
}

// Ne garde, dans une pile, que les lignes de frame (`    at ...`). Verifie contre une vraie
// PrismaClientValidationError et une vraie PrismaClientKnownRequestError (task-5-re-review-3.md,
// I2, demandait de verifier plutot que de croire que « la pile ne contient pas la charge utile ») :
// c'est FAUX en l'etat, les deux ont un `.stack` dont les premieres lignes SONT le message (V8
// prefixe une pile par `${name}: ${message}`), donc une valeur soumise portee par le message s'y
// retrouve integralement si on la journalise telle quelle. Ne garder que les lignes qui matchent
// `/^\s*at\s/` retire ce prefixe quel que soit le nombre de lignes qu'il occupe, sans dependre de
// la forme du message.
const stackFramesOnly = (error: unknown): string | undefined => {
  if (!(error instanceof Error) || !error.stack) {
    return undefined
  }
  const frames = error.stack.split('\n').filter((line) => /^\s*at\s/.test(line))
  return frames.length > 0 ? frames.join('\n') : undefined
}

const isBoomLike = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { isBoom?: boolean }).isBoom === true

// Erreurs maison dont le message est un texte que NOUS avons ecrit, jamais recopie d'une entree
// soumise — au meme titre qu'un Boom (task-5-re-review-4.md, I3). `TenantScopeMissingError` et
// `TenantContextMissingError` (`utils/tenant-errors.ts`) portent, dans leur message, le nom du
// modele/de l'operation/du champ manquant que `back/CLAUDE.md` promet de journaliser ("the error
// message names the entry to add") : sans cette ligne, le garde-fou de tenant refuse une requete
// sans jamais dire pourquoi, a aucun niveau de journal.
const isOwnErrorMessage = (error: unknown): boolean =>
  isBoomLike(error) ||
  error instanceof TenantScopeMissingError ||
  error instanceof TenantContextMissingError

// Ce qu'un journal d'erreur peut porter sans jamais reproduire une valeur soumise :
// - la classe de l'erreur : jamais une valeur soumise.
// - son message, UNIQUEMENT si c'est un Boom ou une des erreurs maison ci-dessus : ni l'un ni
//   l'autre n'est jamais construit qu'a la main dans notre propre code (`boomErrorFromPrismaError`,
//   un `Boom.xxx(...)` explicite dans un domaine, ou le garde-fou de tenant) — son message est
//   donc toujours un texte que l'on a ecrit, jamais recopie d'une erreur brute. C'est la meme
//   distinction que celle d'`error.normalizer.ts` cote reponse HTTP.
// - la pile, filtree aux seules lignes de frame (voir `stackFramesOnly` ci-dessus).
const diagnosticOf = (error: unknown): string => {
  const errorClass = error instanceof Error ? error.constructor.name : typeof error
  const parts = [`class=${errorClass}`]
  if (isOwnErrorMessage(error) && error instanceof Error) {
    parts.push(`message=${error.message}`)
  }
  const frames = stackFramesOnly(error)
  if (frames) {
    parts.push(`stack=${frames}`)
  }
  return parts.join(' | ')
}

// Chemin seul, sans chaine de requete : meme regle que le journal des requetes dans
// fastify-http-server.ts (task-5-re-review-3.md, I3) — les deux partagent `pathWithoutQuery`.
const routeOf = (request: FastifyRequest): string =>
  `${request.method} ${pathWithoutQuery(request.url)}`

const buildErrorHandler = (...errorNormalizers: ErrorNormalizer[]) => {
  return function (
    this: FastifyInstance,
    error: Boom | Error | FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): string | { error: string; message: string; statusCode: number } {
    // Pas de `this.log.debug(error)` ici : c'etait un second canal d'erreur brute
    // (task-5-re-review-3.md, m3), recopiant l'objet entier, message et pile compris. Il n'etait
    // eteint qu'a `LOG_LEVEL=INFO` en production — pas a `DEBUG`, qui est justement le reglage
    // qu'on active pour enqueter sur un incident, c'est-a-dire le moment ou ce canal est lu. Le
    // diagnostic ci-dessous (classe, route, pile filtree aux frames) est deja journalise a
    // `error`, donc visible a `DEBUG` aussi (`error` >= `debug`) : rien n'est perdu.
    this.log.error(
      `Error (#${request.id}) ${routeOf(request)}: ${diagnosticOf(error)}`,
    )
    const errorResponse = normalizeResponse(error, errorNormalizers)
    this.log.error(`Error: ${JSON.stringify(errorResponse)}`)
    reply.status(errorResponse.statusCode)
    const accept = request.accepts()
    if (accept.type('json', 'html') === 'html') {
      reply.type('text/html')
      return html`
        <html lang="en">
          <body>
            <h2>${errorResponse.error}</h2>
            <h3>${errorResponse.message}</h3>
          </body>
        </html>
      `
    }
    return {
      error: errorResponse.error,
      message: errorResponse.message,
      statusCode: errorResponse.statusCode,
    }
  }
}

export { buildErrorHandler, normalizeResponse }
