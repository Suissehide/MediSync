import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type NotificationParams,
  notificationParamsSchema,
  notificationsResponseSchema,
} from '../schemas/notification.schema'

const notificationRouter: FastifyPluginAsync = (fastify) => {
  const { notificationDomain } = fastify.iocContainer

  fastify.get(
    '/',
    {
      schema: { response: { 200: notificationsResponseSchema } },
      config: { permission: 'notifications:own' },
    },
    () => notificationDomain.findMine(),
  )

  fastify.post(
    '/tout-lu',
    {
      schema: { response: { 204: z.null() } },
      config: { permission: 'notifications:own' },
    },
    async (_request, reply) => {
      await notificationDomain.markAllRead()
      reply.code(204).send()
    },
  )

  fastify.post<{ Params: NotificationParams }>(
    '/:notificationId/lu',
    {
      schema: { params: notificationParamsSchema, response: { 204: z.null() } },
      config: { permission: 'notifications:own' },
    },
    async (request, reply) => {
      await notificationDomain.markRead(request.params.notificationId)
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { notificationRouter }
