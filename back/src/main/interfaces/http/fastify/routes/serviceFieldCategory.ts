import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import { withArchived } from '../schemas/index'
import {
  type CreateServiceFieldCategoryBody,
  createServiceFieldCategorySchema,
  type ReorderServiceFieldCategoriesBody,
  reorderServiceFieldCategoriesSchema,
  serviceFieldCategoriesResponseSchema,
  serviceFieldCategoryResponseSchema,
  type UpdateServiceFieldCategoryBody,
  type UpdateServiceFieldCategoryParams,
  updateServiceFieldCategoryByIdSchema,
} from '../schemas/serviceFieldCategory.schema'

const serviceFieldCategoryRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { serviceFieldCategoryDomain } = iocContainer

  // Get all (actives et supprimees) : pose les deux categories a date si elles n'existent pas encore.
  fastify.get(
    '/',
    {
      schema: { response: { 200: serviceFieldCategoriesResponseSchema } },
      config: { permission: 'referentials:read' },
    },
    async () => (await serviceFieldCategoryDomain.findAll()).map(withArchived),
  )

  // Create (en fin d'ordre)
  fastify.post<{ Body: CreateServiceFieldCategoryBody }>(
    '/',
    {
      schema: {
        body: createServiceFieldCategorySchema,
        response: { 201: serviceFieldCategoryResponseSchema },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const created = await serviceFieldCategoryDomain.create(
        request.body.label,
      )
      reply.code(201)
      return withArchived(created)
    },
  )

  // Update (label, suppression) — refuse la suppression d'une categorie a date ou non vide
  fastify.patch<{
    Params: UpdateServiceFieldCategoryParams
    Body: UpdateServiceFieldCategoryBody
  }>(
    '/:categoryID',
    {
      schema: {
        ...updateServiceFieldCategoryByIdSchema,
        response: {
          200: serviceFieldCategoryResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request) => {
      const { categoryID } = request.params
      return withArchived(
        await serviceFieldCategoryDomain.update(categoryID, request.body),
      )
    },
  )

  // Reordonne les categories (jeu complet, supprimees comprises)
  fastify.put<{ Body: ReorderServiceFieldCategoriesBody }>(
    '/order',
    {
      schema: {
        body: reorderServiceFieldCategoriesSchema,
        response: { 204: z.null() },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      await serviceFieldCategoryDomain.reorder(request.body.ids)
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { serviceFieldCategoryRouter }
