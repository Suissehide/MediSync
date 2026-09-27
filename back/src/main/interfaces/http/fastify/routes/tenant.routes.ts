import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import {
  assertNoDeadPatientAccessEntry,
  assertPatientReadLogged,
  assertRoutePermission,
} from '../plugins/tenant.plugin'
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
import { patientServiceFileRouter } from './patientServiceFile'
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
  // Journal des consultations (etape 4b, tache 3) — LA propriete centrale du chantier : toute
  // route GET posee ici dont l'URL designe un dossier patient est journalisee ou explicitement
  // exemptee, sinon le demarrage echoue. Voir assertPatientReadLogged (tenant.plugin.ts) et les
  // deux listes (utils/access-log-routes.ts).
  fastify.addHook('onRoute', assertPatientReadLogged)
  // L'autre sens de la comparaison. Les routes sont collectees TELLES QUE FASTIFY LES ENREGISTRE
  // — pas recopiees — puis confrontees aux deux listes une fois toutes posees, d'ou le `onReady`
  // (un `onRoute` ne peut pas savoir qu'il a vu la derniere route). Le tableau est cree ICI, a
  // chaque enregistrement du greffon, donc une seconde application dans le meme processus
  // (les tests en montent plusieurs) repart d'une collecte vierge.
  const seenTenantRoutes: { method: unknown; url: string }[] = []
  fastify.addHook('onRoute', (route) => {
    seenTenantRoutes.push({ method: route.method, url: route.url })
  })
  fastify.addHook('onReady', () => {
    assertNoDeadPatientAccessEntry(seenTenantRoutes)
    return Promise.resolve()
  })
  fastify.addHook('onRequest', fastify.resolveTenant)
  fastify.addHook('preHandler', fastify.enforcePermission)
  // Retire les champs cliniques du corps de la requête quand l'appelant n'a
  // pas `clinical:write` : il ne doit pas pouvoir écraser ce qu'il ne peut
  // pas lire. Voir tenant.plugin.ts.
  fastify.addHook('preValidation', fastify.stripClinicalInput)
  // Retire les champs cliniques des réponses quand l'appelant n'a pas
  // `clinical:read` (secrétariat, lecture seule). Voir tenant.plugin.ts.
  fastify.addHook('preSerialization', fastify.stripClinicalFields)
  // Ecrit la ligne du journal des consultations, apres que la reponse soit partie. Pose ici, a
  // cote des deux crochets cliniques, et jamais sur les routes individuelles : voir
  // tenant.plugin.ts.
  fastify.addHook('onResponse', fastify.recordPatientAccess)

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
  await fastify.register(patientServiceFileRouter, { prefix: '/patient/:patientID/service-file' })
  await fastify.register(diagnosticEducatifTemplateRouter, { prefix: '/diagnostic-template' })
  await fastify.register(diagnosticEducatifRouter, { prefix: '/patient/:patientId/diagnostic' })
  await fastify.register(enrollmentIssueRouter, { prefix: '/patient/:patientID/enrollment-issue' })
  await fastify.register(activityLogRouter, { prefix: '/activity-log' })
  await fastify.register(forbiddenWeekRouter, { prefix: '/forbidden-week' })
  await fastify.register(planningCycleRouter, { prefix: '/planning-cycle' })
}

export { tenantRoutes }
