import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { appointmentRouter } from './appointment'
import { authRouter } from './auth'
import { healthcheckRouter } from './healthcheck'
import { pathwayRouter } from './pathway'
import { pathwayTemplateRouter } from './pathwayTemplate'
import { patientRouter } from './patient'
import { slotRouter } from './slot'
import { slotTemplateRouter } from './slotTemplate'
import { soignantRouter } from './soignant'
import { thematicRouter } from './thematic'
import { todoRouter } from './todo'
import { userRouter } from './user'

const routes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get('/', async () => {
    return { name: 'MediSync API', status: 'running' }
  })

  await fastify.register(healthcheckRouter)
  await fastify.register(authRouter, { prefix: '/auth' })
  await fastify.register(userRouter, { prefix: '/user' })
  await fastify.register(todoRouter, { prefix: '/todo' })
  await fastify.register(appointmentRouter, { prefix: '/appointment' })
  await fastify.register(slotRouter, { prefix: '/slot' })
  await fastify.register(slotTemplateRouter, { prefix: '/slot-template' })
  await fastify.register(pathwayRouter, { prefix: '/pathway' })
  await fastify.register(pathwayTemplateRouter, { prefix: '/pathway-template' })
  await fastify.register(soignantRouter, { prefix: '/soignant' })
  await fastify.register(thematicRouter, { prefix: '/thematic' })
  await fastify.register(patientRouter, { prefix: '/patient' })
}

export { routes }
