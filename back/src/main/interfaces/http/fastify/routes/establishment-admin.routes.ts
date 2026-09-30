import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { assertRoutePermission, requireTenant } from '../plugins/tenant.plugin'
import {
  type RenameEstablishmentBody,
  renameEstablishmentResponseSchema,
  renameEstablishmentSchema,
} from '../schemas/establishment.schema'
import { activityLogRouter } from './activityLog'
import { grantsRouter } from './grants'
import { membersRouter } from './members'
import { patientAccessLogAdminRouter } from './patientAccessLog'
import { servicesRouter } from './services'

const establishmentAdminRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRoute', assertRoutePermission)
  fastify.addHook('onRequest', fastify.resolveEstablishmentAdmin)
  fastify.addHook('preHandler', fastify.enforcePermission)
  // Même pendant sur l'entrée, pour la même raison de ceinture.
  fastify.addHook('preValidation', fastify.stripClinicalInput)
  // Même filtre de sortie que sous le préfixe de service : aucune route
  // d'administration ne renvoie aujourd'hui de contenu clinique, mais
  // `Patient` est un modèle d'établissement — une route future pourrait en
  // renvoyer, et elle serait filtrée sans qu'on ait à y penser.
  fastify.addHook('preSerialization', fastify.stripClinicalFields)

  // Le chef d'établissement renomme SON établissement : l'id vient du tenant résolu, jamais du
  // corps ni de l'URL. Même méthode de dépôt que la route super-admin.
  fastify.patch<{ Body: RenameEstablishmentBody }>(
    '/',
    {
      schema: {
        body: renameEstablishmentSchema,
        response: { 200: renameEstablishmentResponseSchema },
      },
      config: { permission: 'establishment:rename' },
    },
    (request) =>
      fastify.iocContainer.establishmentDomain.rename(
        requireTenant(request).establishmentId,
        request.body.name,
      ),
  )

  await fastify.register(membersRouter, { prefix: '/members' })
  await fastify.register(grantsRouter, { prefix: '/grants' })
  await fastify.register(servicesRouter, { prefix: '/services' })
  await fastify.register(patientAccessLogAdminRouter, {
    prefix: '/patients/:patientID/acces',
  })
  await fastify.register(activityLogRouter, { prefix: '/activity-log' })
}

export { establishmentAdminRoutes }
