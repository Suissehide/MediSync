import type { FastifyPluginAsync } from 'fastify'

import {
  accountSearchResponseSchema,
  reissueAccessLinkResponseSchema,
  type SearchAccountQuery,
  type SuperAdminUserParams,
  searchAccountQuerySchema,
  superAdminUserParamsSchema,
} from '../../schemas/superAdminUser.schema'

// `GET /super-admin/users?email=` (spec §3.4, §6.2, tâche 7) : la recherche d'un compte, qui
// répond à « untel ne voit plus ses patients » — ses rattachements, ses rôles, ses
// désactivations, son dernier accès. Hérite de `assertRoutePermission`/`requireSuperAdmin`
// (super-admin.routes.ts), comme `establishmentsRouter`.
const usersRouter: FastifyPluginAsync = (fastify) => {
  const { userDomain } = fastify.iocContainer

  fastify.get<{ Querystring: SearchAccountQuery }>(
    '/',
    {
      schema: {
        querystring: searchAccountQuerySchema,
        response: { 200: accountSearchResponseSchema },
      },
      config: { permission: 'establishments:manage' },
    },
    (request) => userDomain.searchByEmail(request.query.email),
  )

  // LA SOUPAPE (tâche 10, tour de correction 1, arbitrage n°3) : le seul recours d'une personne
  // en poste dans plusieurs établissements qui perd son mot de passe — la garde du jeton
  // l'interdit à ses administrateurs d'établissement, et il n'existe aucune route de mot de
  // passe oublié. Voir `UserDomain.reissueAccessLink`.
  fastify.post<{ Params: SuperAdminUserParams }>(
    '/:userId/access-link',
    {
      schema: {
        params: superAdminUserParamsSchema,
        response: { 201: reissueAccessLinkResponseSchema },
      },
      config: { permission: 'establishments:manage' },
    },
    async (request, reply) => {
      const accessLink = await userDomain.reissueAccessLink(
        request.params.userId,
        request.currentUser.id,
      )
      reply.code(201)
      return { accessLink }
    },
  )

  return Promise.resolve()
}

export { usersRouter }
