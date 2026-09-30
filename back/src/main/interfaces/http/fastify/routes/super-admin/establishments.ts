import type { FastifyPluginAsync } from 'fastify'

import {
  type CreateEstablishmentBody,
  createEstablishmentResponseSchema,
  createEstablishmentSchema,
  type EstablishmentIdParams,
  establishmentDetailResponseSchema,
  establishmentIdParamsSchema,
  establishmentListResponseSchema,
  type RenameEstablishmentBody,
  renameEstablishmentResponseSchema,
  renameEstablishmentSchema,
} from '../../schemas/establishment.schema'

// Sous `/super-admin` (super-admin.routes.ts) : hérite de `assertRoutePermission`
// (onRoute) et de `requireSuperAdmin` (onRequest, 404 à qui n'a pas le drapeau `isSuperAdmin`) —
// rien à répéter ici, exactement comme `membersRouter` hérite des crochets
// d'`establishment-admin.routes.ts`.
const establishmentsRouter: FastifyPluginAsync = (fastify) => {
  const { establishmentDomain } = fastify.iocContainer

  // La liste et ses compteurs (spec §3.3). `establishmentDomain.list` encadre chaque
  // compteur d'établissement sous le contexte superadmin — rien à répéter ici.
  fastify.get(
    '/',
    {
      schema: { response: { 200: establishmentListResponseSchema } },
      config: { permission: 'establishments:manage' },
    },
    () => establishmentDomain.list(),
  )

  // Le détail d'UN établissement (spec §6.2) : la ligne de la liste,
  // augmentée des services, des membres et du journal d'activité. 404 si l'id est inconnu.
  fastify.get<{ Params: EstablishmentIdParams }>(
    '/:id',
    {
      schema: {
        params: establishmentIdParamsSchema,
        response: { 200: establishmentDetailResponseSchema },
      },
      config: { permission: 'establishments:manage' },
    },
    (request) => establishmentDomain.getById(request.params.id),
  )

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

  fastify.patch<{
    Params: EstablishmentIdParams
    Body: RenameEstablishmentBody
  }>(
    '/:id',
    {
      schema: {
        params: establishmentIdParamsSchema,
        body: renameEstablishmentSchema,
        response: { 200: renameEstablishmentResponseSchema },
      },
      config: { permission: 'establishments:manage' },
    },
    (request) =>
      establishmentDomain.rename(request.params.id, request.body.name),
  )

  return Promise.resolve()
}

export { establishmentsRouter }
