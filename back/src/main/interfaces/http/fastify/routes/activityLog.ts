import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'

import { Role } from '../../../../../generated/enums'
import {
  activityLogsResponseSchema,
  cleanupResponseSchema,
  getActivityLogsQuerySchema,
  type GetActivityLogsQuery,
} from '../schemas/activityLog.schema'

const activityLogRouter: FastifyPluginAsync = (fastify) => {
  const { activityLogDomain, userDomain } = fastify.iocContainer

  fastify.get<{ Querystring: GetActivityLogsQuery }>(
    '/',
    {
      schema: {
        querystring: getActivityLogsQuerySchema,
        response: { 200: activityLogsResponseSchema },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request) => {
      const currentUser = await userDomain.findByID(request.user.userID)
      if (currentUser?.role !== Role.ADMIN) throw Boom.forbidden('Forbidden')
      const { page, action, userID, from } = request.query
      return activityLogDomain.findMany({ page, action, userID, from })
    },
  )

  fastify.post(
    '/cleanup',
    {
      schema: { response: { 200: cleanupResponseSchema } },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request) => {
      const currentUser = await userDomain.findByID(request.user.userID)
      if (currentUser?.role !== Role.ADMIN) throw Boom.forbidden('Forbidden')
      return activityLogDomain.cleanup()
    },
  )

  return Promise.resolve()
}

export { activityLogRouter }
