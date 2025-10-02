import { z } from 'zod/v4'
import {
  type CreatePathwayBody,
  createPathwaySchema,
  type DeletePathwayByIdParams,
  deletePathwayByIdParamsSchema,
  type GetPathwayByIdParams,
  getPathwayByIdParamsSchema,
  type InstantiatePathwayBody,
  instantiatePathwayBody,
  pathwayResponseSchema,
  pathwaysResponseSchema,
  type UpdatePathwayBody,
  updatePathwayByIdSchema,
  type UpdatePathwayParams,
} from '../schemas/pathway.schema'
import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import dayjs from 'dayjs'
import { combineDateAndTime } from '../../../../utils/date'

const pathwayRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const {
    pathwayDomain,
    pathwayTemplateDomain,
    slotDomain,
    slotTemplateDomain,
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

  // Read by ID
  fastify.get<{ Params: GetPathwayByIdParams }>(
    '/:pathwayID',
    {
      schema: {
        params: getPathwayByIdParamsSchema,
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

      const slotIDs: string[] = []
      for (const slotTemplate of pathwayTemplate.slotTemplates) {
        const { id, soignant, ...rest } = slotTemplate
        const clonedSlotTemplate = await slotTemplateDomain.create({
          ...rest,
          soignantID: soignant?.id ?? undefined,
          templateID: undefined,
        })

        const offset = clonedSlotTemplate.offsetDays ?? 0
        const base = dayjs(startDate).add(offset, 'day').toISOString()

        const start = combineDateAndTime(base, clonedSlotTemplate.startTime)
        const end = combineDateAndTime(base, clonedSlotTemplate.endTime)

        console.log(start, end)

        const slot = await slotDomain.create({
          startDate: start,
          endDate: end,
          slotTemplateID: clonedSlotTemplate.id,
        })
        slotIDs.push(slot.id)
      }

      return await pathwayDomain.create({
        startDate,
        templateID: pathwayTemplate.id,
        slotIDs,
      })
    },
  )

  return Promise.resolve()
}

export { pathwayRouter }
