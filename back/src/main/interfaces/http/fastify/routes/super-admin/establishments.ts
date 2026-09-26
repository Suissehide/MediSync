import type { FastifyPluginAsync } from 'fastify'

import {
  type CreateEstablishmentBody,
  createEstablishmentResponseSchema,
  createEstablishmentSchema,
} from '../../schemas/establishment.schema'

// Sous `/super-admin` (super-admin.routes.ts) : hérite de `assertRoutePermission`
// (onRoute) et de `requireSuperAdmin` (onRequest, 404 à qui n'a pas le drapeau `isSuperAdmin`) —
// rien à répéter ici, exactement comme `membersRouter` hérite des crochets
// d'`establishment-admin.routes.ts`.
const establishmentsRouter: FastifyPluginAsync = (fastify) => {
  const { establishmentDomain } = fastify.iocContainer

  fastify.post<{ Body: CreateEstablishmentBody }>(
    '/',
    {
      schema: {
        body: createEstablishmentSchema,
        response: { 201: createEstablishmentResponseSchema },
      },
      config: { permission: 'establishments:manage' },
    },
    async (request, reply) => {
      const result = await establishmentDomain.createWithFirstAdmin(
        request.body,
        request.currentUser.id,
      )
      reply.code(201)
      return result
    },
  )

  return Promise.resolve()
}

export { establishmentsRouter }
