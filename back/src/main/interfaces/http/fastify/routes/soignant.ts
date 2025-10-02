import { z } from 'zod/v4'
import {
  soignantResponseSchema,
  deleteSoignantByIdParamsSchema,
  getSoignantByIdParamsSchema,
  updateSoignantByIdSchema,
  soignantsResponseSchema,
  createSoignantSchema,
  type GetSoignantByIdParams,
  type CreateSoignantBody,
  type UpdateSoignantParams,
  type UpdateSoignantBody,
  type DeleteSoignantByIdParams,
} from '../schemas/soignant.schema'
import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'

const soignantRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { soignantDomain, logger } = iocContainer

  // Get all
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: soignantsResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    () => {
      return soignantDomain.findAll()
    },
  )

  // Read by ID
  fastify.get<{ Params: GetSoignantByIdParams }>(
    '/:soignantID',
    {
      schema: {
        params: getSoignantByIdParamsSchema,
        response: {
          200: soignantResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { soignantID } = request.params
      const soignant = await soignantDomain.findByID(soignantID)
      if (!soignant) {
        throw Boom.notFound('Soignant not found')
      }
      return soignant
    },
  )

  // Create
  fastify.post<{ Body: CreateSoignantBody }>(
    '/',
    {
      schema: {
        body: createSoignantSchema,
        response: {
          201: soignantResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const soignant = await soignantDomain.create(request.body)
      reply.code(201)
      return soignant
    },
  )

  // Update
  fastify.patch<{ Params: UpdateSoignantParams; Body: UpdateSoignantBody }>(
    '/:soignantID',
    {
      schema: {
        ...updateSoignantByIdSchema,
        response: {
          200: soignantResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { soignantID } = request.params
      const updated = await soignantDomain.update(soignantID, request.body)
      if (!updated) {
        throw Boom.notFound('Soignant not found')
      }
      return updated
    },
  )

  // Delete
  fastify.delete<{ Params: DeleteSoignantByIdParams }>(
    '/:soignantID',
    {
      schema: {
        params: deleteSoignantByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { soignantID } = request.params
      const deleted = await soignantDomain.delete(soignantID)
      if (!deleted) {
        logger.info('Soignant not found')
        throw Boom.notFound('Soignant not found')
      }
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { soignantRouter }
