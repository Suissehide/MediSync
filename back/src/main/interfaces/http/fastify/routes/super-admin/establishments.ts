import type { FastifyPluginAsync } from 'fastify'

import {
  type CreateEstablishmentBody,
  createEstablishmentResponseSchema,
  createEstablishmentSchema,
  type EstablishmentActivityLogQuery,
  establishmentActivityLogQuerySchema,
  establishmentActivityLogResponseSchema,
  establishmentDetailResponseSchema,
  type EstablishmentIdParams,
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
  // augmentée des services et des membres. 404 si l'id est inconnu. NE REND PLUS LE JOURNAL
  // (2026-10-01) : il a sa propre route paginée, juste en dessous.
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

  // Le journal d'activité de l'établissement, paginé (2026-10-01). Il vivait DANS la réponse
  // ci-dessus, borné à 100 lignes et sans rien pour aller au-delà — ni pour savoir qu'il y avait
  // un au-delà. Même permission que ses voisines (`establishments:manage`) : c'est la même zone,
  // et `assertSuperAdminShapedRoute` exige de toute façon qu'elle soit déclarée.
  fastify.get<{
    Params: EstablishmentIdParams
    Querystring: EstablishmentActivityLogQuery
  }>(
    '/:id/activity-log',
    {
      schema: {
        params: establishmentIdParamsSchema,
        querystring: establishmentActivityLogQuerySchema,
        response: { 200: establishmentActivityLogResponseSchema },
      },
      config: { permission: 'establishments:manage' },
    },
    async (request) => {
      const { page, pageSize } = request.query
      const { data, total } = await establishmentDomain.activityLogFor(
        request.params.id,
        { page, pageSize },
      )
      return { data, total, page, pageSize }
    },
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
