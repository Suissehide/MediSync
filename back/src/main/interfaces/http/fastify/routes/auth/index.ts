import type { FastifyPluginAsync } from 'fastify'

import { accessLinkRouter } from './access-link.router'
import { refreshRouter } from './refresh.router'
import { registerRouter } from './register.router'
import { signInRouter } from './sign-in.router'
import { signOutRouter } from './sign-out.router'

const authRouter: FastifyPluginAsync = async (fastify) => {
  await fastify.register(signInRouter, { prefix: '/sign-in' })
  await fastify.register(signOutRouter, { prefix: '/sign-out' })
  await fastify.register(registerRouter, { prefix: '/register' })
  await fastify.register(refreshRouter, { prefix: '/refresh' })
  await fastify.register(accessLinkRouter, { prefix: '/access-link' })
}

export { authRouter }
