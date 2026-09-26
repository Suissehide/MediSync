import type { FastifyPluginAsync } from 'fastify'

import { establishmentGrantResponseSchema } from '../schemas/superAdminGrant.schema'

// `GET /e/:establishmentId/admin/grants` (spec §3.5, §6.2, tâche 8) : les octrois — en cours ET
// passés — dont CET établissement a fait l'objet, avec leur motif et leur auteur. Sous le
// préfixe d'établissement (établishment-admin.routes.ts) : hérite de `resolveEstablishmentAdmin`
// (l'appelant doit être ADMIN de CET établissement, sans quoi 404 avant même d'atteindre ce
// handler) et de `enforcePermission` (`members:manage`) — comme `membersRouter`. Un
// administrateur d'un AUTRE établissement n'atteint jamais ce handler avec un autre id : soit il
// n'a aucun rattachement sur `establishmentId` et `resolveEstablishmentAdmin` répond 404 avant
// lui, soit il n'y est pas ADMIN et la même résolution le refuse.
const grantsRouter: FastifyPluginAsync = (fastify) => {
  const { superAdminGrantDomain } = fastify.iocContainer

  fastify.get(
    '/',
    {
      schema: { response: { 200: establishmentGrantResponseSchema } },
      config: { permission: 'members:manage' },
    },
    () => superAdminGrantDomain.forEstablishment(),
  )

  return Promise.resolve()
}

export { grantsRouter }
