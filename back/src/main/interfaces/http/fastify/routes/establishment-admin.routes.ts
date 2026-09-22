import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { assertRoutePermission } from '../plugins/tenant.plugin'
import { locationAdminRouter } from './location'
import { membersRouter } from './members'
import { soignantAdminRouter } from './soignant'

const establishmentAdminRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRoute', assertRoutePermission)
  fastify.addHook('onRequest', fastify.resolveEstablishmentAdmin)
  fastify.addHook('preHandler', fastify.enforcePermission)

  await fastify.register(membersRouter, { prefix: '/members' })
  await fastify.register(soignantAdminRouter, { prefix: '/soignant' })
  await fastify.register(locationAdminRouter, { prefix: '/location' })
}

export { establishmentAdminRoutes }
