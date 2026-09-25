import Boom from '@hapi/boom'
import type { FastifyRequest } from 'fastify'

import { pathWithoutQuery } from '../../../../utils/url-helper'

const notFoundHandler = (request: FastifyRequest): void => {
  const { method, url } = request
  // Meme regle que `fastify-http-server.ts` et `error.handler.ts` (task-5-re-review-3.md, I3) :
  // le message d'un Boom repart tel quel dans le corps HTTP 404 (`boomErrorNormalizer`) et dans
  // le journal `error` (`diagnosticOf`, un Boom est justement le cas ou son message est repris) —
  // c'etait le quatrieme endroit du meme dossier a recopier `request.url` en entier, chaine de
  // requete comprise (task-5-re-review-4.md, C1). `url`, la valeur complete, reste disponible
  // dans le `data` du Boom, qui n'est ni serialise dans la reponse ni journalise.
  throw Boom.notFound(`Route ${method} ${pathWithoutQuery(url)} not found`, {
    method,
    url,
  })
}

export { notFoundHandler }
