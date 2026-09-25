import Boom from '@hapi/boom'
import type { FastifyRequest } from 'fastify'

import { notFoundHandler } from '../../../main/interfaces/http/fastify/util/not-found.handler'

// task-5-re-review-4.md, C1 : `notFoundHandler` recopiait `request.url` en entier, chaine de
// requete comprise, dans le message du Boom — repris tel quel dans le corps HTTP 404
// (`boomErrorNormalizer`) et dans les deux lignes de journal `error` (`diagnosticOf`, qui reprend
// le message d'un Boom precisement parce que c'est un Boom). C'etait le quatrieme endroit du
// meme dossier a manquer `pathWithoutQuery`, apres les trois corriges au tour precedent.
const QUERY_MARKER = 'MOTIF-CLINIQUE-MARQUEUR-NOTFOUND'

const buildRequest = (url: string): FastifyRequest =>
  ({ method: 'GET', url }) as unknown as FastifyRequest

describe('notFoundHandler', () => {
  it('ne recopie pas la chaine de requete dans le message du Boom', () => {
    expect(() =>
      notFoundHandler(buildRequest(`/nope?q=${QUERY_MARKER}`)),
    ).toThrow(
      expect.objectContaining({
        isBoom: true,
        message: expect.not.stringContaining(QUERY_MARKER),
      }),
    )
  })

  it('dit toujours quelle route n existe pas (methode et chemin, sans la chaine de requete)', () => {
    try {
      notFoundHandler(buildRequest('/nope?q=valeur'))
      throw new Error('notFoundHandler aurait du jeter')
    } catch (error) {
      expect(Boom.isBoom(error)).toBe(true)
      const boomError = error as Boom.Boom
      expect(boomError.message).toBe('Route GET /nope not found')
      expect(boomError.output.statusCode).toBe(404)
    }
  })
})
