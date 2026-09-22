import type { FastifyPluginAsync } from 'fastify'

import {
  activityLogsResponseSchema,
  cleanupResponseSchema,
  type GetActivityLogsQuery,
  getActivityLogsQuerySchema,
} from '../schemas/activityLog.schema'

const activityLogRouter: FastifyPluginAsync = (fastify) => {
  const { activityLogDomain } = fastify.iocContainer

  fastify.get<{ Querystring: GetActivityLogsQuery }>(
    '/',
    {
      schema: {
        querystring: getActivityLogsQuerySchema,
        response: { 200: activityLogsResponseSchema },
      },
      config: { permission: 'planning:write' },
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
      config: { permission: 'planning:write' },
    },
    () => activityLogDomain.cleanup(),
  )

  return Promise.resolve()
}

export { activityLogRouter }
