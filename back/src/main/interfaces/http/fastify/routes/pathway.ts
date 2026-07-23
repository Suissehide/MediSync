import Boom from '@hapi/boom'
import dayjs from 'dayjs'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import { combineDateAndTime } from '../../../../utils/date'
import {
  buildWeekMapping,
  computeEffectiveOffset,
} from '../../../../utils/pathway-schedule'
import {
  type CreatePathwayBody,
  createPathwaySchema,
  type DeletePathwayByIdParams,
  deletePathwayByIdParamsSchema,
  type GetPathwayByIdParams,
  type InstantiatePathwayBody,
  instantiatePathwayBody,
  pathwayResponseSchema,
  pathwaysResponseSchema,
  type TrackingQuery,
  trackingQuerySchema,
  trackingResponseSchema,
  type UpdatePathwayBody,
  type UpdatePathwayParams,
  updatePathwayByIdSchema,
} from '../schemas/pathway.schema'

const pathwayRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const {
    pathwayDomain,
    pathwayTemplateDomain,
    slotDomain,
    slotTemplateDomain,
    forbiddenWeekDomain,
    logger,
  } = iocContainer

  // Get all
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: pathwaysResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    () => {
      return pathwayDomain.findAll()
    },
  )

  // Tracking (must be before /:pathwayID to avoid param collision)
  fastify.get<{ Querystring: TrackingQuery }>(
    '/tracking',
    {
      schema: {
        querystring: trackingQuerySchema,
        response: {
          200: trackingResponseSchema,
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    (request) => {
      const { year, month } = request.query
      return pathwayDomain.findTracking(year, month)
    },
  )

  // Read by ID
  fastify.get<{ Params: GetPathwayByIdParams }>(
    '/:pathwayID',
    {
      schema: {
        response: {
          200: pathwayResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { pathwayID } = request.params
      const pathway = await pathwayDomain.findByID(pathwayID)
      if (!pathway) {
        throw Boom.notFound('Pathway not found')
      }
      return pathway
    },
  )

  // Create
  fastify.post<{ Body: CreatePathwayBody }>(
    '/',
    {
      schema: {
        body: createPathwaySchema,
        response: {
          201: pathwayResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const pathway = await pathwayDomain.create(request.body)
      reply.code(201)
      return pathway
    },
  )

  // Update
  fastify.patch<{ Params: UpdatePathwayParams; Body: UpdatePathwayBody }>(
    '/:pathwayID',
    {
      schema: {
        ...updatePathwayByIdSchema,
        response: {
          200: pathwayResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { pathwayID } = request.params
      const updated = await pathwayDomain.update(pathwayID, request.body)
      if (!updated) {
        throw Boom.notFound('Pathway not found')
      }
      return updated
    },
  )

  // Delete
  fastify.delete<{ Params: DeletePathwayByIdParams }>(
    '/:pathwayID',
    {
      schema: {
        params: deletePathwayByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { pathwayID } = request.params
      const deleted = await pathwayDomain.delete(pathwayID)
      if (!deleted) {
        logger.info('Pathway not found')
        throw Boom.notFound('Pathway not found')
      }
      reply.code(204).send()
    },
  )

  // Instantiate Pathway Template
  fastify.post<{ Body: InstantiatePathwayBody }>(
    '/instantiate',
    {
      schema: {
        body: instantiatePathwayBody,
        response: {
          200: pathwayResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { pathwayTemplateID, startDate } = request.body
      const pathwayTemplate =
        await pathwayTemplateDomain.findByID(pathwayTemplateID)
      if (!pathwayTemplate) {
        throw Boom.notFound('PathwayTemplate not found')
      }

      // Build a week mapping that skips forbidden weeks so the pathway
      // spans over them instead of being shifted entirely.
      const forbiddenWeeks = await forbiddenWeekDomain.findAll()

      const maxOffsetDays =
        pathwayTemplate.slotTemplates.length > 0
          ? Math.max(
              ...pathwayTemplate.slotTemplates.map((st) => st.offsetDays ?? 0),
            )
          : 0
      const weekMapping = buildWeekMapping(
        startDate,
        maxOffsetDays,
        forbiddenWeeks,
      )

      const effectiveStartDate = dayjs(startDate).toISOString()

      const slotIDs: string[] = []
      for (const slotTemplate of pathwayTemplate.slotTemplates) {
        const effectiveOffset = computeEffectiveOffset(
          slotTemplate.offsetDays ?? 0,
          weekMapping,
        )

        const clonedSlotTemplate = await slotTemplateDomain.create({
          startTime: slotTemplate.startTime,
          endTime: slotTemplate.endTime,
          offsetDays: effectiveOffset,
          isIndividual: slotTemplate.isIndividual,
          capacity: slotTemplate.capacity,
          thematicId: slotTemplate.thematicId,
          locationID: slotTemplate.locationID,
          description: slotTemplate.description,
          color: slotTemplate.color,
          soignantIDs: slotTemplate.soignants.map((s) => s.id),
        })

        const base = dayjs(effectiveStartDate)
          .add(effectiveOffset, 'day')
          .toISOString()

        const start = combineDateAndTime(base, clonedSlotTemplate.startTime)
        const end = combineDateAndTime(base, clonedSlotTemplate.endTime)

        const slot = await slotDomain.create({
          startDate: start,
          endDate: end,
          slotTemplateID: clonedSlotTemplate.id,
        })
        slotIDs.push(slot.id)
      }

      return await pathwayDomain.create({
        startDate: effectiveStartDate,
        templateID: pathwayTemplate.id,
        slotIDs,
      })
    },
  )

  return Promise.resolve()
}

export { pathwayRouter }
