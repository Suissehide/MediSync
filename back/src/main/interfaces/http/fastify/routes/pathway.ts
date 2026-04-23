import Boom from '@hapi/boom'
import dayjs from 'dayjs'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import { combineDateAndTime, toStartOfWeek } from '../../../../utils/date'
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
      const adjustedStart = dayjs(startDate)

      const isWeekForbidden = (date: Date): boolean => {
        const weekStart = dayjs(toStartOfWeek(date))
        return forbiddenWeeks.some((fw) => {
          return weekStart.isSame(dayjs(fw.startOfWeek), 'day')
        })
      }

      // Determine the number of logical weeks the pathway spans
      const maxOffsetDays = Math.max(
        ...pathwayTemplate.slotTemplates.map((st) => st.offsetDays ?? 0),
      )
      const maxLogicalWeek = Math.floor(maxOffsetDays / 7)

      // Map each logical week index to an actual week offset (skipping forbidden weeks)
      const weekMapping = new Map<number, number>()
      let actualWeekOffset = 0
      for (
        let logicalWeek = 0;
        logicalWeek <= maxLogicalWeek;
        logicalWeek++
      ) {
        while (
          isWeekForbidden(
            adjustedStart.add(actualWeekOffset * 7, 'day').toDate(),
          )
        ) {
          actualWeekOffset++
          if (actualWeekOffset > logicalWeek + 52) {
            throw Boom.conflict(
              'Aucune date de début disponible dans les 52 prochaines semaines en raison des semaines interdites',
            )
          }
        }
        weekMapping.set(logicalWeek, actualWeekOffset)
        actualWeekOffset++
      }

      const effectiveStartDate = adjustedStart.toISOString()

      const slotIDs: string[] = []
      for (const slotTemplate of pathwayTemplate.slotTemplates) {
        const { soignant, id: _id, ...rest } = slotTemplate

        // Compute the effective offset by adding the extra weeks from forbidden week skipping
        const originalOffset = slotTemplate.offsetDays ?? 0
        const logicalWeek = Math.floor(originalOffset / 7)
        const dayInWeek = originalOffset % 7
        const actualWeek = weekMapping.get(logicalWeek) ?? logicalWeek
        const effectiveOffset = actualWeek * 7 + dayInWeek

        const clonedSlotTemplate = await slotTemplateDomain.create({
          ...rest,
          offsetDays: effectiveOffset,
          soignantID: soignant?.id ?? undefined,
          templateID: undefined,
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
