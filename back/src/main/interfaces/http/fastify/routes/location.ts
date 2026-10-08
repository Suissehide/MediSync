import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type CreateLocationBody,
  createLocationSchema,
  type DeleteLocationByIdParams,
  deleteLocationByIdParamsSchema,
  type GetLocationByIdParams,
  getLocationByIdParamsSchema,
  type ListLocationsQuery,
  listLocationsQuerySchema,
  locationResponseSchema,
  locationsResponseSchema,
  type UpdateLocationBody,
  type UpdateLocationParams,
  updateLocationByIdSchema,
} from '../schemas/location.schema'

// Lecture, sous le préfixe de service : /e/:establishmentId/s/:serviceId/location.
const locationReadRouter: FastifyPluginAsync = (fastify) => {
  const { locationDomain } = fastify.iocContainer

  // Get all
  fastify.get<{ Querystring: ListLocationsQuery }>(
    '/',
    {
      schema: {
        querystring: listLocationsQuerySchema,
        response: {
          200: locationsResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:read' },
    },
    (request) => {
      return locationDomain.findAll(request.query.archived)
    },
  )

  // Read by ID
  fastify.get<{ Params: GetLocationByIdParams }>(
    '/:locationID',
    {
      schema: {
        params: getLocationByIdParamsSchema,
        response: {
          200: locationResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:read' },
    },
    async (request) => {
      const { locationID } = request.params
      const location = await locationDomain.findByID(locationID)
      if (!location) {
        throw Boom.notFound('Location not found')
      }
      return location
    },
  )

  return Promise.resolve()
}

// Ecriture, sous le prefixe de service comme la lecture : les locations sont propres a chaque
// service depuis le 2026-09-29, et leur gestion revient au coordinateur (`referentials:write`,
// le droit qui gere deja les thematiques et les modeles de diagnostic).
const locationWriteRouter: FastifyPluginAsync = (fastify) => {
  const { locationDomain, logger } = fastify.iocContainer

  // Create
  fastify.post<{ Body: CreateLocationBody }>(
    '/',
    {
      schema: {
        body: createLocationSchema,
        response: {
          201: locationResponseSchema,
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const location = await locationDomain.create(request.body)
      reply.code(201)
      return location
    },
  )

  // Update
  fastify.patch<{ Params: UpdateLocationParams; Body: UpdateLocationBody }>(
    '/:locationID',
    {
      schema: {
        ...updateLocationByIdSchema,
        response: {
          200: locationResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request) => {
      const { locationID } = request.params
      const updated = await locationDomain.update(locationID, request.body)
      if (!updated) {
        throw Boom.notFound('Location not found')
      }
      return updated
    },
  )

  // Delete
  // Archive (la restauration passe par PATCH { archived: false })
  fastify.delete<{ Params: DeleteLocationByIdParams }>(
    '/:locationID',
    {
      schema: {
        params: deleteLocationByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const { locationID } = request.params
      const archived = await locationDomain.update(locationID, {
        archived: true,
      })
      if (!archived) {
        logger.info('Location not found')
        throw Boom.notFound('Location not found')
      }
      reply.code(204).send()
    },
  )

  // Suppression DEFINITIVE d'une ligne deja archivee. Refusee en 409 tant que
  // quelque chose la reference ; la base le refuse de toute facon.
  fastify.delete<{ Params: DeleteLocationByIdParams }>(
    '/:locationID/definitive',
    {
      schema: {
        params: deleteLocationByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      await locationDomain.deleteForever(request.params.locationID)
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { locationReadRouter, locationWriteRouter }
