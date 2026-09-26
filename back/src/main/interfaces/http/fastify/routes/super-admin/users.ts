import type { FastifyPluginAsync } from 'fastify'

import {
  accountSearchResponseSchema,
  type SearchAccountQuery,
  searchAccountQuerySchema,
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

  return Promise.resolve()
}

export { usersRouter }
