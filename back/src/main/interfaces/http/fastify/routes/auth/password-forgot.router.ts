import type { FastifyPluginAsync } from 'fastify'

import {
  type PasswordForgotInput,
  passwordForgotSchema,
} from '../../schemas/auth.schema'

// Réponse identique (204) que l'adresse existe ou non, et AVANT tout travail : ni le statut ni
// le temps de réponse ne disent si un compte existe.
const passwordForgotRouter: FastifyPluginAsync = (fastify) => {
  const { accessLinkDomain, logger } = fastify.iocContainer

  fastify.post<{ Body: PasswordForgotInput }>(
    '/',
    {
      schema: { body: passwordForgotSchema },
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      accessLinkDomain.requestPasswordReset(request.body.email).catch((err) => {
        const errorClass =
          err instanceof Error ? err.constructor.name : typeof err
        logger.error(`Password reset request failed [${errorClass}]`)
      })
      return await reply.code(204).send()
    },
  )
  return Promise.resolve()
}

export { passwordForgotRouter }
