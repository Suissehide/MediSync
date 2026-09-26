import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type CreateGrantBody,
  createGrantSchema,
  type GrantIdParams,
  grantIdParamsSchema,
  grantResponseSchema,
} from '../../schemas/superAdminGrant.schema'

// Sous `/super-admin` (super-admin.routes.ts) : hérite de `assertRoutePermission` et de
// `requireSuperAdmin`, exactement comme `establishmentsRouter`/`usersRouter`.
//
// `userId` du corps de la création n'existe PAS : c'est TOUJOURS `request.currentUser.id`
// (spec §3.5, « le super-admin peut S'ACCORDER l'accès ») — jamais un id soumis, qui aurait
// permis d'octroyer un accès à un tiers plutôt qu'à soi-même.
const grantsRouter: FastifyPluginAsync = (fastify) => {
  const { superAdminGrantDomain } = fastify.iocContainer

  fastify.post<{ Body: CreateGrantBody }>(
    '/',
    {
      schema: {
        body: createGrantSchema,
        response: { 201: grantResponseSchema },
      },
      config: { permission: 'establishments:manage' },
    },
    async (request, reply) => {
      const grant = await superAdminGrantDomain.grant({
        userId: request.currentUser.id,
        establishmentId: request.body.establishmentId,
        reason: request.body.reason,
        durationHours: request.body.durationHours,
      })
      reply.code(201)
      return grant
    },
  )

  // Révoque avant terme (spec §6.2). PAS une suppression : `SuperAdminGrantDomain.revoke` pose
  // `revokedAt`, la ligne survit — le `DELETE` est un verbe HTTP, pas une opération de
  // suppression en base (voir le commentaire sur `SuperAdminGrantEntityRepo`).
  fastify.delete<{ Params: GrantIdParams }>(
    '/:id',
    {
      schema: {
        params: grantIdParamsSchema,
        response: { 204: z.null() },
      },
      config: { permission: 'establishments:manage' },
    },
    async (request, reply) => {
      await superAdminGrantDomain.revoke(request.params.id)
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { grantsRouter }
