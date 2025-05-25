import { signInResponseSchema } from '../../schemas/auth/auth.schema'
import type { CookieSerializeOptions } from '@fastify/cookie'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import Boom from '@hapi/boom'

const refreshRouter: FastifyPluginAsyncZod = (fastify) => {
  const { iocContainer } = fastify
  const { authDomain } = iocContainer
  fastify.post(
    '/',
    {
      schema: {
        response: {
          200: signInResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const refreshToken = request.cookies.refresh_token
      if (!refreshToken) {
        throw Boom.unauthorized('Missing refresh token')
      }
      const {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        email,
        firstname,
        lastname,
      } = await authDomain.refresh(refreshToken)

      const cookieOptions: CookieSerializeOptions = {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // strict
      }
      reply
        .setCookie('access_token', newAccessToken, {
          ...cookieOptions,
          maxAge: 1000 * 60 * 15, // 15 minutes in ms
        })
        .setCookie('refresh_token', newRefreshToken, {
          ...cookieOptions,
          maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days in ms
        })

      return { email, firstname, lastname }
    },
  )
  return Promise.resolve()
}

export { refreshRouter }
