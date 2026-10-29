import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type GetPlanningConflictsQuery,
  getPlanningConflictsQuerySchema,
  planningConflictsSchema,
} from '../schemas/planningConflict.schema'
import {
  type CreateSlotBody,
  createSlotWithTemplateSchema,
  type DeleteSlotByIdParams,
  deleteSlotByIdParamsSchema,
  type GetSlotByIdParams,
  type GetSlotsQuery,
  getSlotByIdParamsSchema,
  getSlotsQuerySchema,
  slotResponseSchema,
  slotsResponseSchema,
  slotWithConflictsResponseSchema,
  type UpdateSlotBody,
  type UpdateSlotParams,
  updateSlotByIdSchema,
} from '../schemas/slot.schema'

const slotRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { slotDomain, slotTemplateDomain, logger } = iocContainer

  // Get all
  fastify.get<{ Querystring: GetSlotsQuery }>(
    '/',
    {
      schema: {
        querystring: getSlotsQuerySchema,
        response: {
          200: slotsResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'planning:read' },
    },
    async (request) => {
      const { from, to, patientID } = request.query
      return await slotDomain.findAll({ from, to, patientID })
    },
  )

  // Conflits de la fenêtre : alimente les badges du planning.
  fastify.get<{ Querystring: GetPlanningConflictsQuery }>(
    '/conflicts',
    {
      schema: {
        querystring: getPlanningConflictsQuerySchema,
        response: {
          200: z.object({ conflicts: planningConflictsSchema }),
        },
      },
      config: { permission: 'planning:read' },
    },
    async (request) => ({
      conflicts: await slotDomain.findConflicts(request.query),
    }),
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
      config: { permission: 'planning:read' },
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
          201: slotWithConflictsResponseSchema,
        },
      },
      config: { permission: 'planning:write' },
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
      return { ...slot, conflicts: await slotDomain.conflictsOf(slot.id) }
    },
  )

  // Update
  fastify.patch<{ Params: UpdateSlotParams; Body: UpdateSlotBody }>(
    '/:slotID',
    {
      schema: {
        ...updateSlotByIdSchema,
        response: {
          200: slotWithConflictsResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'planning:write' },
    },
    async (request) => {
      const { slotID } = request.params
      const updated = await slotDomain.update(slotID, request.body)
      if (!updated) {
        throw Boom.notFound('Slot not found')
      }
      return { ...updated, conflicts: await slotDomain.conflictsOf(slotID) }
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
      config: { permission: 'planning:write' },
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
