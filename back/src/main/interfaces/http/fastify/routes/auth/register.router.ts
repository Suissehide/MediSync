import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import HttpStatusCodes from 'http-status-codes'

import {
  type CreateUserInput,
  registerResponseSchema,
  registerSchema,
} from '../../schemas/auth.schema'

const registerRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { authDomain, logger } = iocContainer

  fastify.post<{ Body: CreateUserInput }>(
    '/',
    {
      schema: {
        body: registerSchema,
        response: {
          201: registerResponseSchema,
        },
      },
      config: {
        // Anti-abus sur la création de comptes.
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const { success, data, error } = registerSchema.safeParse(request.body)
      if (!success) {
        // Ne jamais logger le corps de requête (contient le mot de passe).
        logger.debug(`Invalid register payload: ${error.message}`)
        throw Boom.badRequest(error)
      }
      await authDomain.register(data)

      reply.status(HttpStatusCodes.CREATED)
      await reply.send()
    },
  )
  return Promise.resolve()
}

export { registerRouter }
