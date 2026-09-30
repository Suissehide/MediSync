import Boom from '@hapi/boom'
import type { onRequestAsyncHookHandler } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { assertRoutePermission } from '../plugins/tenant.plugin'
import { accessLogRouter } from './super-admin/access-log'
import { establishmentsRouter } from './super-admin/establishments'
import { grantsRouter } from './super-admin/grants'
import { usersRouter } from './super-admin/users'

// Partagée avec le garde-fou racine ci-dessous et l'enregistrement du plugin (routes/index.ts),
// pour qu'un futur renommage du préfixe ne puisse pas faire diverger les deux en silence.
export const SUPER_ADMIN_PREFIX = '/super-admin'

// Frère d'`assertTenantShapedRoute` (tenant.plugin.ts), pour le même défaut précis : une route
// dont l'URL commence par `/super-admin` mais serait enregistrée EN DEHORS de `superAdminRoutes`
// (un `register` au mauvais niveau, dans une tâche future) échapperait à la fois au garde-fou de
// permission du plugin et à `requireSuperAdmin` — elle serait joignable par n'importe quel compte
// authentifié, sans que rien ne le signale. La forme de l'URL suffit à exiger la déclaration
// d'une permission, où que la route soit posée ; posé comme hook `onRoute` À LA RACINE
// (routes/index.ts), donc vu pour absolument toute route de l'application, pas seulement celles
// enregistrées sous ce plugin.
//
// Même limite, assumée, que son aîné (le commentaire au-dessus d'`assertTenantShapedRoute` le dit
// pour le tenant ; CLAUDE.md le redit : « the Prisma tenant-guard is the only remaining
// barrier ») : Fastify ne donne, au moment où `onRoute` s'exécute, AUCUN moyen public
// d'inspecter la chaîne de crochets qu'une route héritera réellement à l'exécution (`opts.prefix`
// et `opts.url` sont de simples chaînes, identiques que la route soit nichée dans ce plugin ou
// enregistrée ailleurs avec le même préfixe littéral — vérifié en lisant `route.js` de Fastify).
// Ce garde-fou exige donc la déclaration d'une permission, il ne PROUVE pas que `requireSuperAdmin`
// a été câblé sur cette route précise — voir le rapport de tâche pour le détail et les deux
// preuves par exécution (route jetable dans le plugin, route jetable hors du plugin).
export const assertSuperAdminShapedRoute = (
  route: Parameters<typeof assertRoutePermission>[0],
): void => {
  if (route.url.startsWith(SUPER_ADMIN_PREFIX)) {
    assertRoutePermission(route)
  }
}

// Crochet du plugin `/super-admin` : un compte sans le drapeau `isSuperAdmin` reçoit 404,
// jamais 403 — même parti pris que `resolveTenantFromUser` pour un établissement ou un service
// inconnu (tenant.plugin.ts) : ne pas révéler l'existence d'une zone qu'on n'a pas le droit de
// voir (§5.2/§6.2 de la spec). `request.currentUser` est déjà posé par la garde
// d'authentification globale (routes/index.ts, `verifySessionCookie`) avant que ce crochet ne
// s'exécute, sous ce préfixe comme sous tout autre route protégée — d'où l'absence de logique de
// session ici, seulement la lecture du drapeau.
export const requireSuperAdmin: onRequestAsyncHookHandler = (request) => {
  if (request.currentUser?.isSuperAdmin !== true) {
    throw Boom.notFound()
  }
  return Promise.resolve()
}

// Suit la forme d'establishment-admin.routes.ts : le garde-fou existant `assertRoutePermission`
// fait échouer le démarrage si une route posée ici oublie sa permission (`config.permission`),
// puis `requireSuperAdmin` referme l'accès à qui n'a pas le drapeau. Chaque routeur enregistré
// ici (établissements, comptes, octrois) hérite des deux crochets sans avoir à y penser,
// exactement comme `membersRouter` ou `servicesRouter` héritent de ceux
// d'establishment-admin.routes.ts.
const superAdminRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRoute', assertRoutePermission)
  fastify.addHook('onRequest', requireSuperAdmin)
  await fastify.register(establishmentsRouter, { prefix: '/establishments' })
  await fastify.register(usersRouter, { prefix: '/users' })
  await fastify.register(grantsRouter, { prefix: '/grants' })
  await fastify.register(accessLogRouter, { prefix: '/access-log' })
}

export { superAdminRoutes }
