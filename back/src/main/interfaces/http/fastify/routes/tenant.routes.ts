import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { assertRoutePermission } from '../plugins/tenant.plugin'
import { activityLogRouter } from './activityLog'
import { appointmentRouter } from './appointment'
import { diagnosticEducatifRouter } from './diagnosticEducatif'
import { diagnosticEducatifTemplateRouter } from './diagnosticEducatifTemplate'
import { enrollmentIssueRouter } from './enrollmentIssue'
import { forbiddenWeekRouter } from './forbiddenWeek'
import { locationReadRouter } from './location'
import { pathwayRouter } from './pathway'
import { pathwayTemplateRouter } from './pathwayTemplate'
import { patientRouter } from './patient'
import { planningCycleRouter } from './planningCycle'
import { slotRouter } from './slot'
import { slotTemplateRouter } from './slotTemplate'
import { soignantReadRouter } from './soignant'
import { thematicRouter } from './thematic'
import { todoRouter } from './todo'

// Toute route enregistrée ici vit sous /e/:establishmentId/s/:serviceId et
// doit déclarer `config.permission`. Le hook onRoute fait échouer le
// démarrage sinon (fail-safe).
const tenantRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRoute', assertRoutePermission)
  fastify.addHook('onRequest', fastify.resolveTenant)
  fastify.addHook('preHandler', fastify.enforcePermission)
  // Retire les champs cliniques des réponses quand l'appelant n'a pas
  // `clinical:read` (secrétariat, lecture seule). Voir tenant.plugin.ts.
  fastify.addHook('preSerialization', fastify.stripClinicalFields)

  await fastify.register(todoRouter, { prefix: '/todo' })
  await fastify.register(appointmentRouter, { prefix: '/appointment' })
  await fastify.register(slotRouter, { prefix: '/slot' })
  await fastify.register(slotTemplateRouter, { prefix: '/slot-template' })
  await fastify.register(pathwayRouter, { prefix: '/pathway' })
  await fastify.register(pathwayTemplateRouter, { prefix: '/pathway-template' })
  await fastify.register(soignantReadRouter, { prefix: '/soignant' })
  await fastify.register(thematicRouter, { prefix: '/thematic' })
  await fastify.register(locationReadRouter, { prefix: '/location' })
  await fastify.register(patientRouter, { prefix: '/patient' })
  await fastify.register(diagnosticEducatifTemplateRouter, { prefix: '/diagnostic-template' })
  await fastify.register(diagnosticEducatifRouter, { prefix: '/patient/:patientId/diagnostic' })
  await fastify.register(enrollmentIssueRouter, { prefix: '/patient/:patientID/enrollment-issue' })
  await fastify.register(activityLogRouter, { prefix: '/activity-log' })
  await fastify.register(forbiddenWeekRouter, { prefix: '/forbidden-week' })
  await fastify.register(planningCycleRouter, { prefix: '/planning-cycle' })
}

export { tenantRoutes }
