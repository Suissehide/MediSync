import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type CreateThematicBody,
  createThematicSchema,
  type DeleteThematicByIdParams,
  deleteThematicByIdParamsSchema,
  type GetThematicByIdParams,
  getThematicByIdParamsSchema,
  thematicResponseSchema,
  thematicsResponseSchema,
  type UpdateThematicBody,
  type UpdateThematicParams,
  updateThematicByIdSchema,
} from '../schemas/thematic.schema'

const thematicRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { thematicDomain, logger } = iocContainer

  // Get all
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: thematicsResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    () => {
      return thematicDomain.findAll()
    },
  )

  // Read by ID
  fastify.get<{ Params: GetThematicByIdParams }>(
    '/:thematicID',
    {
      schema: {
        params: getThematicByIdParamsSchema,
        response: {
          200: thematicResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { thematicID } = request.params
      const thematic = await thematicDomain.findByID(thematicID)
      if (!thematic) {
        throw Boom.notFound('Thematic not found')
      }
      return thematic
    },
  )

  // Create
  fastify.post<{ Body: CreateThematicBody }>(
    '/',
    {
      schema: {
        body: createThematicSchema,
        response: {
          201: thematicResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const thematic = await thematicDomain.create(request.body)
      reply.code(201)
      return thematic
    },
  )

  // Update
  fastify.patch<{ Params: UpdateThematicParams; Body: UpdateThematicBody }>(
    '/:thematicID',
    {
      schema: {
        ...updateThematicByIdSchema,
        response: {
          200: thematicResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { thematicID } = request.params
      const updated = await thematicDomain.update(thematicID, request.body)
      if (!updated) {
        throw Boom.notFound('Thematic not found')
      }
      return updated
    },
  )

  // Delete
  fastify.delete<{ Params: DeleteThematicByIdParams }>(
    '/:thematicID',
    {
      schema: {
        params: deleteThematicByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { thematicID } = request.params
      const deleted = await thematicDomain.delete(thematicID)
      if (!deleted) {
        logger.info('Thematic not found')
        throw Boom.notFound('Thematic not found')
      }
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { thematicRouter }
