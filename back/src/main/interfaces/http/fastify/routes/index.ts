import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { authRouter } from './auth'
import { establishmentAdminRoutes } from './establishment-admin.routes'
import { healthcheckRouter } from './healthcheck'
import { meRouter } from './me'
import { tenantRoutes } from './tenant.routes'

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
  await fastify.register(meRouter, { prefix: '/me' })
  await fastify.register(tenantRoutes, { prefix: '/e/:establishmentId/s/:serviceId' })
  await fastify.register(establishmentAdminRoutes, { prefix: '/e/:establishmentId/admin' })
}

export { routes }
