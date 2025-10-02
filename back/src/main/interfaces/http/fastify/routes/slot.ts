import { z } from 'zod/v4'
import {
  type CreateSlotBody,
  createSlotWithTemplateSchema,
  type DeleteSlotByIdParams,
  deleteSlotByIdParamsSchema,
  type GetSlotByIdParams,
  getSlotByIdParamsSchema,
  slotResponseSchema,
  slotsResponseSchema,
  type UpdateSlotBody,
  updateSlotByIdSchema,
  type UpdateSlotParams,
} from '../schemas/slot.schema'
import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'

const slotRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { slotDomain, slotTemplateDomain, logger } = iocContainer

  // Get all
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: slotsResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    async () => {
      return await slotDomain.findAll()
    },
  )

  // Read by ID
  fastify.get<{ Params: GetSlotByIdParams }>(
    '/:slotID',
    {
      schema: {
        params: getSlotByIdParamsSchema,
        response: {
          200: slotResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { slotID } = request.params
      const slot = await slotDomain.findByID(slotID)
      if (!slot) {
        throw Boom.notFound('Slot not found')
      }
      return slot
    },
  )

  // Create
  fastify.post<{ Body: CreateSlotBody }>(
    '/',
    {
      schema: {
        body: createSlotWithTemplateSchema,
        response: {
          201: slotResponseSchema,
        },
      },
    },
    async (request, reply) => {
      let createSlotInput = request.body

      if (!('slotTemplateID' in createSlotInput)) {
        const { slotTemplate, ...rest } = createSlotInput
        const createdTemplate = await slotTemplateDomain.create({
          ...slotTemplate,
        })
        createSlotInput = {
          ...rest,
          slotTemplateID: createdTemplate.id,
        }
      }

      const slot = await slotDomain.create(createSlotInput)
      reply.code(201)
      return slot
    },
  )

  // Update
  fastify.patch<{ Params: UpdateSlotParams; Body: UpdateSlotBody }>(
    '/:slotID',
    {
      schema: {
        ...updateSlotByIdSchema,
        response: {
          200: slotResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { slotID } = request.params
      const updated = await slotDomain.update(slotID, request.body)
      if (!updated) {
        throw Boom.notFound('Slot not found')
      }
      return updated
    },
  )

  // Delete
  fastify.delete<{ Params: DeleteSlotByIdParams }>(
    '/:slotID',
    {
      schema: {
        params: deleteSlotByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { slotID } = request.params
      const deleted = await slotDomain.delete(slotID)
      if (!deleted) {
        logger.info('Slot not found')
        throw Boom.notFound('Slot not found')
      }
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { slotRouter }
