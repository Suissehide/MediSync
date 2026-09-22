import type { FastifyPluginAsync } from 'fastify'

import {
  activityLogsResponseSchema,
  cleanupResponseSchema,
  type GetActivityLogsQuery,
  getActivityLogsQuerySchema,
} from '../schemas/activityLog.schema'

// Le journal d'activité est une prérogative de l'administrateur
// d'établissement (document d'habilitations) : `activity-log:read` conserve
// exactement les comptes qui y avaient accès avant la refonte multi-tenant.
// Le routeur reste sous le préfixe de service ; c'est sans conséquence, car
// le tenant résolu sous ce préfixe porte aussi `establishmentRole`, seul
// champ que `hasPermission` consulte pour une permission d'établissement.
const activityLogRouter: FastifyPluginAsync = (fastify) => {
  const { activityLogDomain } = fastify.iocContainer

  fastify.get<{ Querystring: GetActivityLogsQuery }>(
    '/',
    {
      schema: {
        querystring: getActivityLogsQuerySchema,
        response: { 200: activityLogsResponseSchema },
      },
      config: { permission: 'activity-log:read' },
    },
    (request) => {
      const { page, action, userID, from } = request.query
      return activityLogDomain.findMany({ page, action, userID, from })
    },
  )

  fastify.post(
    '/cleanup',
    {
      schema: { response: { 200: cleanupResponseSchema } },
      config: { permission: 'activity-log:read' },
    },
    () => activityLogDomain.cleanup(),
  )

  return Promise.resolve()
}

export { activityLogRouter }
