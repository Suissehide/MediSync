import type { CookieSerializeOptions } from '@fastify/cookie'
import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'

import {
  type SignInInput,
  signInResponseSchema,
  signInSchema,
} from '../../schemas/auth.schema'

const signInRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { authDomain, logger } = iocContainer

  fastify.post<{ Body: SignInInput }>(
    '/',
    {
      schema: {
        body: signInSchema,
        response: {
          201: signInResponseSchema,
        },
      },
      config: {
        // Anti brute-force sur l'authentification.
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const { success, data, error } = signInSchema.safeParse(request.body)
      if (!success) {
        // Ne jamais logger le corps de requête (contient le mot de passe).
        logger.debug(`Invalid sign-in payload: ${error.message}`)
        throw Boom.badRequest(error)
      }
      const { email: inputEmail, password: inputPassword } = data

      const {
        accessToken,
        refreshToken,
        id,
        email,
        firstName,
        lastName,
        role,
        soignantId,
      } = await authDomain.signIn(inputEmail, inputPassword)

      const cookieOptions: CookieSerializeOptions = {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // strict
      }
      reply
        .setCookie('access_token', accessToken, {
          ...cookieOptions,
          maxAge: 1000 * 60 * 15, // 15 minutes in ms
        })
        .setCookie('refresh_token', refreshToken, {
          ...cookieOptions,
          maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days in ms
        })

      return { id, email, firstName, lastName, role, soignantId }
    },
  )
  return Promise.resolve()
}

export { signInRouter }
