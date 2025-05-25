import { authRouter } from './auth'
import { healthcheckRouter } from './healthcheck'
import { appointmentRouter } from './appointment'
import type { FastifyPluginAsync } from 'fastify'
import { todoRouter } from './todo'

const routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthcheckRouter)
  await fastify.register(authRouter, { prefix: '/auth' })
  await fastify.register(appointmentRouter, { prefix: '/appointment' })
  await fastify.register(todoRouter, { prefix: '/todo' })
}

export { routes }
