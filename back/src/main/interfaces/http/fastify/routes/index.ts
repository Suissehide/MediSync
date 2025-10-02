import { authRouter } from './auth'
import { healthcheckRouter } from './healthcheck'
import { appointmentRouter } from './appointment'
import { todoRouter } from './todo'
import { soignantRouter } from './soignant'
import { slotRouter } from './slot'
import { slotTemplateRouter } from './slotTemplate'
import { pathwayRouter } from './pathway'
import { pathwayTemplateRouter } from './pathwayTemplate'
import { patientRouter } from './patient'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

const routes: FastifyPluginAsyncZod = async (fastify) => {
  await fastify.register(healthcheckRouter)
  await fastify.register(authRouter, { prefix: '/auth' })
  await fastify.register(todoRouter, { prefix: '/todo' })
  await fastify.register(appointmentRouter, { prefix: '/appointment' })
  await fastify.register(slotRouter, { prefix: '/slot' })
  await fastify.register(slotTemplateRouter, { prefix: '/slot-template' })
  await fastify.register(pathwayRouter, { prefix: '/pathway' })
  await fastify.register(pathwayTemplateRouter, { prefix: '/pathway-template' })
  await fastify.register(soignantRouter, { prefix: '/soignant' })
  await fastify.register(patientRouter, { prefix: '/patient' })
}

export { routes }
