import type { FastifyPluginAsync } from 'fastify'

import {
  activityLogsResponseSchema,
  type CleanupActivityLogsQuery,
  cleanupActivityLogsQuerySchema,
  cleanupResponseSchema,
  type GetActivityLogsQuery,
  getActivityLogsQuerySchema,
} from '../schemas/activityLog.schema'

// Le journal d'activité est une prérogative de l'administrateur
// d'établissement (document d'habilitations) : `activity-log:read` conserve
// exactement les comptes qui y avaient accès avant la refonte multi-tenant.
// Monté sous le préfixe d'administration (/e/:establishmentId/admin/activity-log)
// depuis la navigation par échelle (2026-09-28) : il couvre tout
// l'établissement, filtrable par service (`ActivityLogRepository.scopeFilter`),
// et un administrateur sans affectation de service peut enfin l'atteindre.
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
      const { page, action, userID, from, serviceId } = request.query
      return activityLogDomain.findMany({ page, action, userID, from, serviceId })
    },
  )

  fastify.post<{ Querystring: CleanupActivityLogsQuery }>(
    '/cleanup',
    {
      schema: {
        querystring: cleanupActivityLogsQuerySchema,
        response: { 200: cleanupResponseSchema },
      },
      // Supprimer des entrées d'audit n'est pas une consultation.
      config: { permission: 'activity-log:write' },
    },
    (request) => activityLogDomain.cleanup({ serviceId: request.query.serviceId }),
  )

  return Promise.resolve()
}

export { activityLogRouter }
