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
  type ListThematicsQuery,
  listThematicsQuerySchema,
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
  fastify.get<{ Querystring: ListThematicsQuery }>(
    '/',
    {
      schema: {
        querystring: listThematicsQuerySchema,
        response: {
          200: thematicsResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:read' },
    },
    (request) => {
      return thematicDomain.findAll(request.query.archived)
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
      config: { permission: 'referentials:read' },
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
      config: { permission: 'referentials:write' },
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
      config: { permission: 'referentials:write' },
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

  // Archive (la restauration passe par PATCH { archived: false })
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
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const { thematicID } = request.params
      const archived = await thematicDomain.update(thematicID, {
        archived: true,
      })
      if (!archived) {
        logger.info('Thematic not found')
        throw Boom.notFound('Thematic not found')
      }
      reply.code(204).send()
    },
  )

  // Suppression DEFINITIVE d'une ligne deja archivee. Refusee en 409 tant que
  // quelque chose la reference ; la base le refuse de toute facon.
  fastify.delete<{ Params: DeleteThematicByIdParams }>(
    '/:thematicID/definitive',
    {
      schema: {
        params: deleteThematicByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      await thematicDomain.deleteForever(request.params.thematicID)
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { thematicRouter }
