import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import { Role } from '../../../../../generated/enums'
import {
  type CreateForbiddenWeekBody,
  createForbiddenWeekBodySchema,
  type DeleteForbiddenWeekParams,
  deleteForbiddenWeekParamsSchema,
  forbiddenWeekResponseSchema,
  forbiddenWeeksResponseSchema,
} from '../schemas/forbiddenWeek.schema'

const forbiddenWeekRouter: FastifyPluginAsync = (fastify) => {
  const { forbiddenWeekDomain, userDomain } = fastify.iocContainer

  // Readable by any authenticated user (needed to display forbidden weeks in calendar)
  // Get all
  fastify.get(
    '/',
    {
      schema: { response: { 200: forbiddenWeeksResponseSchema } },
      onRequest: [fastify.verifySessionCookie],
    },
    () => forbiddenWeekDomain.findAll(),
  )

  // Create (admin only)
  fastify.post<{ Body: CreateForbiddenWeekBody }>(
    '/',
    {
      schema: {
        body: createForbiddenWeekBodySchema,
        response: {
          201: forbiddenWeekResponseSchema,
          403: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request, reply) => {
      const currentUser = await userDomain.findByID(request.user.userID)
      if (currentUser?.role !== Role.ADMIN) throw Boom.forbidden('Forbidden')
      const forbiddenWeek = await forbiddenWeekDomain.create(request.body.date)
      reply.code(201)
      return forbiddenWeek
    },
  )

  // Delete (admin only)
  fastify.delete<{ Params: DeleteForbiddenWeekParams }>(
    '/:id',
    {
      schema: {
        params: deleteForbiddenWeekParamsSchema,
        response: {
          204: z.null(),
          403: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request, reply) => {
      const currentUser = await userDomain.findByID(request.user.userID)
      if (currentUser?.role !== Role.ADMIN) throw Boom.forbidden('Forbidden')
      await forbiddenWeekDomain.delete(request.params.id)
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { forbiddenWeekRouter }
