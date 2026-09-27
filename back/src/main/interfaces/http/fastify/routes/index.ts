import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { assertTenantShapedRoute } from '../plugins/tenant.plugin'
import { authRouter } from './auth'
import { establishmentAdminRoutes } from './establishment-admin.routes'
import { healthcheckRouter } from './healthcheck'
import { meRouter } from './me'
import {
  assertSuperAdminShapedRoute,
  SUPER_ADMIN_PREFIX,
  superAdminRoutes,
} from './super-admin.routes'
import {
  assertNoDeadAdminPatientExemption,
  assertPatientRouteUnderTenant,
  TENANT_PREFIX,
  tenantRoutes,
} from './tenant.routes'

// Routes publiques (sans session) : racine, healthcheck et authentification.
const PUBLIC_ROUTES = new Set(['/', '/health'])

const routes: FastifyPluginAsyncZod = async (fastify) => {
  // Toute route de forme multi-tenant doit déclarer sa permission, où qu'elle
  // soit enregistrée — voir assertTenantShapedRoute.
  fastify.addHook('onRoute', assertTenantShapedRoute)
  // Même garde, pour le même défaut, côté préfixe super-admin — voir assertSuperAdminShapedRoute.
  fastify.addHook('onRoute', assertSuperAdminShapedRoute)
  // Troisième de la famille (étape 4b) : une route de LECTURE qui désigne un dossier patient et
  // qui serait enregistrée hors du greffon de tenant échapperait au journal des consultations,
  // sans que rien ne le signale. Elle est refusée au démarrage — voir
  // assertPatientRouteUnderTenant. Sauf déclaration explicite dans EXEMPTED_ADMIN_PATIENT_ROUTES
  // (utils/access-log-routes.ts), pour les routes de lecture qui ne lisent jamais le dossier
  // lui-même (tour de correction 1, tâche 5, étape 4b) — voir le commentaire du garde-fou.
  fastify.addHook('onRoute', assertPatientRouteUnderTenant)
  // Contrepartie du garde-fou ci-dessus, posée ICI (racine) plutôt que sous `tenantRoutes` :
  // c'est ici qu'`assertPatientRouteUnderTenant` vit, et les routes d'administration
  // (`establishmentAdminRoutes`, enregistrée plus bas) ne sont pas visibles depuis
  // `tenantRoutes`. Le tableau est créé ICI, à chaque enregistrement du greffon racine — une
  // seconde application dans le même processus (les tests en montent plusieurs) repart d'une
  // collecte vierge, même principe que `seenTenantRoutes` (tenant.routes.ts).
  const seenRoutes: { method: unknown; url: string }[] = []
  fastify.addHook('onRoute', (route) => {
    seenRoutes.push({ method: route.method, url: route.url })
  })
  fastify.addHook('onReady', () => {
    assertNoDeadAdminPatientExemption(seenRoutes)
    return Promise.resolve()
  })

  const { tenantContext } = fastify.iocContainer

  // Garde d'authentification globale : toute route est protégée par défaut,
  // sauf les routes publiques et le préfixe /auth/*. Ainsi une route qui
  // oublierait `verifySessionCookie` reste protégée (fail-safe).
  fastify.addHook('onRequest', async (request, reply) => {
    // Première instruction, avant même le test des routes publiques :
    // `enterWith` teinte le contexte asynchrone sans refermer sa portée, une
    // requête sans tenant pourrait donc hériter du tenant de la précédente
    // sur un worker réutilisé. Refermer ici garantit que toute requête
    // démarre sans tenant, et donc que « sans tenant, toute opération sur un
    // modèle de tenant est refusée » reste vrai.
    tenantContext.clear()
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
  await fastify.register(tenantRoutes, { prefix: TENANT_PREFIX })
  await fastify.register(establishmentAdminRoutes, {
    prefix: '/e/:establishmentId/admin',
  })
  await fastify.register(superAdminRoutes, { prefix: SUPER_ADMIN_PREFIX })
}

export { routes }
