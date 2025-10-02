import { z } from 'zod/v4'
import {
  pathwayTemplateResponseSchema,
  deletePathwayTemplateByIdParamsSchema,
  getPathwayTemplateByIdParamsSchema,
  updatePathwayTemplateByIdSchema,
  pathwayTemplatesResponseSchema,
  createPathwayTemplateSchema,
  type GetPathwayTemplateByIdParams,
  type CreatePathwayTemplateBody,
  type UpdatePathwayTemplateParams,
  type UpdatePathwayTemplateBody,
  type DeletePathwayTemplateByIdParams,
} from '../schemas/pathwayTemplate.schema'
import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'

const pathwayTemplateRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { pathwayTemplateDomain, logger } = iocContainer

  // Get all
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: pathwayTemplatesResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    () => pathwayTemplateDomain.findAll(),
  )

  // Read by ID
  fastify.get<{ Params: GetPathwayTemplateByIdParams }>(
    '/:pathwayTemplateID',
    {
      schema: {
        params: getPathwayTemplateByIdParamsSchema,
        response: {
          200: pathwayTemplateResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { pathwayTemplateID } = request.params
      const pathwayTemplate =
        await pathwayTemplateDomain.findByID(pathwayTemplateID)
      if (!pathwayTemplate) {
        throw Boom.notFound('PathwayTemplate not found')
      }
      return pathwayTemplate
    },
  )

  // Create
  fastify.post<{ Body: CreatePathwayTemplateBody }>(
    '/',
    {
      schema: {
        body: createPathwayTemplateSchema,
        response: {
          201: pathwayTemplateResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const pathwayTemplate = await pathwayTemplateDomain.create(request.body)
      reply.code(201)
      return pathwayTemplate
    },
  )

  // Update
  fastify.patch<{
    Params: UpdatePathwayTemplateParams
    Body: UpdatePathwayTemplateBody
  }>(
    '/:pathwayTemplateID',
    {
      schema: {
        ...updatePathwayTemplateByIdSchema,
        response: {
          200: pathwayTemplateResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { pathwayTemplateID } = request.params
      const updated = await pathwayTemplateDomain.update(
        pathwayTemplateID,
        request.body,
      )
      if (!updated) {
        throw Boom.notFound('PathwayTemplate not found')
      }
      return updated
    },
  )

  // Delete
  fastify.delete<{ Params: DeletePathwayTemplateByIdParams }>(
    '/:pathwayTemplateID',
    {
      schema: {
        params: deletePathwayTemplateByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { pathwayTemplateID } = request.params
      const deleted = await pathwayTemplateDomain.delete(pathwayTemplateID)
      if (!deleted) {
        logger.info('PathwayTemplate not found')
        throw Boom.notFound('PathwayTemplate not found')
      }
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { pathwayTemplateRouter }
