import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { appointmentRouter } from './appointment'
import { authRouter } from './auth'
import { healthcheckRouter } from './healthcheck'
import { locationRouter } from './location'
import { pathwayRouter } from './pathway'
import { pathwayTemplateRouter } from './pathwayTemplate'
import { patientRouter } from './patient'
import { slotRouter } from './slot'
import { slotTemplateRouter } from './slotTemplate'
import { soignantRouter } from './soignant'
import { thematicRouter } from './thematic'
import { todoRouter } from './todo'
import { userRouter } from './user'
import { diagnosticEducatifRouter } from './diagnosticEducatif'
import { diagnosticEducatifTemplateRouter } from './diagnosticEducatifTemplate'
import { enrollmentIssueRouter } from './enrollmentIssue'
import { activityLogRouter } from './activityLog'
import { forbiddenWeekRouter } from './forbiddenWeek'

// Routes publiques (sans session) : racine, healthcheck et authentification.
const PUBLIC_ROUTES = new Set(['/', '/health'])

const routes: FastifyPluginAsyncZod = async (fastify) => {
  // Garde d'authentification globale : toute route est protégée par défaut,
  // sauf les routes publiques et le préfixe /auth/*. Ainsi une route qui
  // oublierait `verifySessionCookie` reste protégée (fail-safe).
  fastify.addHook('onRequest', async (request, reply) => {
    const url = request.routeOptions.url ?? request.url
    if (PUBLIC_ROUTES.has(url) || url.startsWith('/auth/')) {
      return
    }
    await fastify.verifySessionCookie.call(fastify, request, reply)
  })

  fastify.get('/', () => {
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
  await fastify.register(locationRouter, { prefix: '/location' })
  await fastify.register(patientRouter, { prefix: '/patient' })
  await fastify.register(diagnosticEducatifTemplateRouter, { prefix: '/diagnostic-template' })
  await fastify.register(diagnosticEducatifRouter, { prefix: '/patient/:patientId/diagnostic' })
  await fastify.register(enrollmentIssueRouter, { prefix: '/patient/:patientID/enrollment-issue' })
  await fastify.register(activityLogRouter, { prefix: '/activity-log' })
  await fastify.register(forbiddenWeekRouter, { prefix: '/forbidden-week' })
}

export { routes }
