import Boom from '@hapi/boom'
import type { onRequestAsyncHookHandler } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { assertRoutePermission } from '../plugins/tenant.plugin'

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
// puis `requireSuperAdmin` referme l'accès à qui n'a pas le drapeau. Les tâches 6, 7 et 8
// enregistrent ici leurs routeurs (établissements, comptes, octrois) ; chacun hérite des deux
// crochets sans avoir à y penser, exactement comme `membersRouter`/`soignantAdminRouter`/
// `locationAdminRouter` héritent de ceux d'establishment-admin.routes.ts.
const superAdminRoutes: FastifyPluginAsyncZod = (fastify) => {
  fastify.addHook('onRoute', assertRoutePermission)
  fastify.addHook('onRequest', requireSuperAdmin)
  return Promise.resolve()
}

export { superAdminRoutes }
