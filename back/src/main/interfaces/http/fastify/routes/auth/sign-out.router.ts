import HttpStatusCodes from 'http-status-codes'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { CookieSerializeOptions } from '@fastify/cookie'

const signOutRouter: FastifyPluginAsyncZod = (fastify) => {
  fastify.post('/', (__, reply) => {
    const cookieOptions: CookieSerializeOptions = {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    }

    reply
      .clearCookie('access_token', cookieOptions)
      .clearCookie('refresh_token', cookieOptions)
      .status(HttpStatusCodes.NO_CONTENT)
      .send()
  })

  return Promise.resolve()
}

export { signOutRouter }
