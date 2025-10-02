import { z } from 'zod/v4'
import {
  slotTemplateResponseSchema,
  deleteSlotTemplateByIdParamsSchema,
  getSlotTemplateByIdParamsSchema,
  updateSlotTemplateByIdSchema,
  slotTemplatesResponseSchema,
  createSlotTemplateSchema,
  type GetSlotTemplateByIdParams,
  type CreateSlotTemplateBody,
  type UpdateSlotTemplateParams,
  type UpdateSlotTemplateBody,
  type DeleteSlotTemplateByIdParams,
} from '../schemas/slotTemplate.schema'
import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'

const slotTemplateRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { slotTemplateDomain, logger } = iocContainer

  // Get all
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: slotTemplatesResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    () => {
      return slotTemplateDomain.findAll()
    },
  )

  // Read by ID
  fastify.get<{ Params: GetSlotTemplateByIdParams }>(
    '/:slotTemplateID',
    {
      schema: {
        params: getSlotTemplateByIdParamsSchema,
        response: {
          200: slotTemplateResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { slotTemplateID } = request.params
      const slotTemplate = await slotTemplateDomain.findByID(slotTemplateID)
      if (!slotTemplate) {
        throw Boom.notFound('SlotTemplate not found')
      }
      return slotTemplate
    },
  )

  // Create
  fastify.post<{ Body: CreateSlotTemplateBody }>(
    '/',
    {
      schema: {
        body: createSlotTemplateSchema,
        response: {
          201: slotTemplateResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const createSlotTemplateInput = request.body

      const slotTemplate = await slotTemplateDomain.create({
        ...createSlotTemplateInput,
      })
      reply.code(201)
      return slotTemplate
    },
  )

  // Update
  fastify.patch<{
    Params: UpdateSlotTemplateParams
    Body: UpdateSlotTemplateBody
  }>(
    '/:slotTemplateID',
    {
      schema: {
        ...updateSlotTemplateByIdSchema,
        response: {
          200: slotTemplateResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { slotTemplateID } = request.params
      const updated = await slotTemplateDomain.update(
        slotTemplateID,
        request.body,
      )
      if (!updated) {
        throw Boom.notFound('SlotTemplate not found')
      }
      return updated
    },
  )

  // Delete
  fastify.delete<{ Params: DeleteSlotTemplateByIdParams }>(
    '/:slotTemplateID',
    {
      schema: {
        params: deleteSlotTemplateByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { slotTemplateID } = request.params
      const deleted = await slotTemplateDomain.delete(slotTemplateID)
      if (!deleted) {
        logger.info('SlotTemplate not found')
        throw Boom.notFound('SlotTemplate not found')
      }
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { slotTemplateRouter }
