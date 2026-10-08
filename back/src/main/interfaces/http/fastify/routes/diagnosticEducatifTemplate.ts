import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type CreateDiagnosticEducatifTemplateBody,
  createDiagnosticEducatifTemplateSchema,
  type DiagnosticTemplateParams,
  diagnosticEducatifTemplateResponseSchema,
  diagnosticEducatifTemplatesResponseSchema,
  diagnosticTemplateParamsSchema,
  type ListDiagnosticTemplatesQuery,
  listDiagnosticTemplatesQuerySchema,
  type UpdateDiagnosticEducatifTemplateBody,
  type UpdateDiagnosticEducatifTemplateParams,
  updateDiagnosticEducatifTemplateSchema,
} from '../schemas/diagnosticEducatif.schema'

const diagnosticEducatifTemplateRouter: FastifyPluginAsync = (fastify) => {
  const { diagnosticEducatifTemplateDomain } = fastify.iocContainer

  // Get all
  fastify.get<{ Querystring: ListDiagnosticTemplatesQuery }>(
    '/',
    {
      schema: {
        querystring: listDiagnosticTemplatesQuerySchema,
        response: { 200: diagnosticEducatifTemplatesResponseSchema },
      },
      config: { permission: 'referentials:read' },
    },
    (request) =>
      diagnosticEducatifTemplateDomain.findAll(request.query.archived),
  )

  // Get by ID
  fastify.get<{ Params: DiagnosticTemplateParams }>(
    '/:templateId',
    {
      schema: {
        params: diagnosticTemplateParamsSchema,
        response: {
          200: diagnosticEducatifTemplateResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:read' },
    },
    async (request) => {
      const template = await diagnosticEducatifTemplateDomain.findByID(
        request.params.templateId,
      )
      if (!template) {
        throw Boom.notFound('Template not found')
      }
      return template
    },
  )

  // Create
  fastify.post<{ Body: CreateDiagnosticEducatifTemplateBody }>(
    '/',
    {
      schema: {
        body: createDiagnosticEducatifTemplateSchema,
        response: { 201: diagnosticEducatifTemplateResponseSchema },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const template = await diagnosticEducatifTemplateDomain.create(
        request.body,
      )
      reply.code(201)
      return template
    },
  )

  // Update
  fastify.patch<{
    Params: UpdateDiagnosticEducatifTemplateParams
    Body: UpdateDiagnosticEducatifTemplateBody
  }>(
    '/:templateId',
    {
      schema: {
        ...updateDiagnosticEducatifTemplateSchema,
        response: { 200: diagnosticEducatifTemplateResponseSchema },
      },
      config: { permission: 'referentials:write' },
    },
    (request) => {
      return diagnosticEducatifTemplateDomain.update(
        request.params.templateId,
        request.body,
      )
    },
  )

  // Archive (la restauration passe par PATCH { archived: false })
  fastify.delete<{ Params: DiagnosticTemplateParams }>(
    '/:templateId',
    {
      schema: {
        params: diagnosticTemplateParamsSchema,
        response: { 204: z.null() },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      await diagnosticEducatifTemplateDomain.update(request.params.templateId, {
        archived: true,
      })
      reply.code(204).send()
    },
  )

  // Suppression DEFINITIVE d'une ligne deja archivee. Refusee en 409 tant que
  // quelque chose la reference ; la base le refuse de toute facon.
  fastify.delete<{ Params: DiagnosticTemplateParams }>(
    '/:templateId/definitive',
    {
      schema: {
        params: diagnosticTemplateParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      await diagnosticEducatifTemplateDomain.deleteForever(
        request.params.templateId,
      )
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { diagnosticEducatifTemplateRouter }
