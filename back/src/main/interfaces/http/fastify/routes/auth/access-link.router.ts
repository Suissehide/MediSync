import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'

import {
  type AccessLinkConsumeInput,
  accessLinkConsumeResponseSchema,
  accessLinkConsumeSchema,
} from '../../schemas/auth.schema'

// Le jeton est un identifiant de connexion : il ne doit apparaître dans AUCUNE URL — il passe
// donc uniquement dans le corps de ce POST, jamais dans un paramètre de route ni une query
// (spec §6.1 ; voir back/src/test/unit/interfaces/access-link-token-leak.test.ts, qui exige
// cette forme).
const accessLinkRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { accessLinkDomain, logger } = iocContainer

  fastify.post<{ Body: AccessLinkConsumeInput }>(
    '/consume',
    {
      schema: {
        body: accessLinkConsumeSchema,
        response: {
          200: accessLinkConsumeResponseSchema,
        },
      },
      config: {
        // Anti brute-force : un jeton se devine par force brute comme un mot de passe.
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (request) => {
      const { success, data, error } = accessLinkConsumeSchema.safeParse(
        request.body,
      )
      if (!success) {
        // Ne jamais logger le corps de requête (contient le jeton et le mot de passe).
        logger.debug(`Invalid access-link consume payload: ${error.message}`)
        throw Boom.badRequest(error)
      }
      const { token, password } = data
      await accessLinkDomain.consume(token, password)
      return { success: true }
    },
  )
  return Promise.resolve()
}

export { accessLinkRouter }
