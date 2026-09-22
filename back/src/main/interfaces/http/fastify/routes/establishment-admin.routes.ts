import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { assertRoutePermission } from '../plugins/tenant.plugin'
import { locationAdminRouter } from './location'
import { soignantAdminRouter } from './soignant'

const establishmentAdminRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRoute', assertRoutePermission)
  fastify.addHook('onRequest', fastify.resolveEstablishmentAdmin)
  fastify.addHook('preHandler', fastify.enforcePermission)

  // Les routes de gestion des membres (/members) sont ajoutées à la tâche 15.
  await fastify.register(soignantAdminRouter, { prefix: '/soignant' })
  await fastify.register(locationAdminRouter, { prefix: '/location' })
}

export { establishmentAdminRoutes }
