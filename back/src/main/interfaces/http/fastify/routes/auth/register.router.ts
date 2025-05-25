import Boom from '@hapi/boom'
import {
  type CreateUserInput,
  registerResponseSchema,
  registerSchema,
} from '../../schemas/auth/auth.schema'
import HttpStatusCodes from 'http-status-codes'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

const registerRouter: FastifyPluginAsyncZod = (fastify) => {
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
    },
    async (request, reply) => {
      const { success, data, error } = registerSchema.safeParse(request.body)
      if (!success) {
        logger.debug(
          `req body: ${JSON.stringify(request.body)}, error: ${error.message}`,
        )
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
