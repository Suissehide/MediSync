import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type CreateSoignantBody,
  createSoignantSchema,
  type DeleteSoignantByIdParams,
  deleteSoignantByIdParamsSchema,
  type GetSoignantByIdParams,
  getSoignantByIdParamsSchema,
  type ListSoignantsQuery,
  listSoignantsQuerySchema,
  soignantResponseSchema,
  soignantsResponseSchema,
  type UpdateSoignantBody,
  type UpdateSoignantParams,
  updateSoignantByIdSchema,
} from '../schemas/soignant.schema'

// Lecture, sous le préfixe de service : /e/:establishmentId/s/:serviceId/soignant.
const soignantReadRouter: FastifyPluginAsync = (fastify) => {
  const { soignantDomain } = fastify.iocContainer

  // Get all
  fastify.get<{ Querystring: ListSoignantsQuery }>(
    '/',
    {
      schema: {
        querystring: listSoignantsQuerySchema,
        response: {
          200: soignantsResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:read' },
    },
    (request) => {
      return soignantDomain.findAll(request.query.archived)
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
      config: { permission: 'referentials:read' },
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

  return Promise.resolve()
}

// Ecriture, sous le prefixe de service comme la lecture : les soignants sont propres a chaque
// service depuis le 2026-09-29, et leur gestion revient au coordinateur (`referentials:write`,
// le droit qui gere deja les thematiques et les modeles de diagnostic).
const soignantWriteRouter: FastifyPluginAsync = (fastify) => {
  const { soignantDomain, logger } = fastify.iocContainer

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
      config: { permission: 'referentials:write' },
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
      config: { permission: 'referentials:write' },
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
  // Archive (la restauration passe par PATCH { archived: false })
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
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const { soignantID } = request.params
      const archived = await soignantDomain.update(soignantID, {
        archived: true,
      })
      if (!archived) {
        logger.info('Soignant not found')
        throw Boom.notFound('Soignant not found')
      }
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { soignantReadRouter, soignantWriteRouter }
