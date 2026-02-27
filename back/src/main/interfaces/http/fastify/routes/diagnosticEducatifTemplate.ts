import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'
import {
  type CreateDiagnosticEducatifTemplateBody,
  type DiagnosticTemplateParams,
  type UpdateDiagnosticEducatifTemplateBody,
  type UpdateDiagnosticEducatifTemplateParams,
  createDiagnosticEducatifTemplateSchema,
  diagnosticEducatifTemplateResponseSchema,
  diagnosticEducatifTemplatesResponseSchema,
  diagnosticTemplateParamsSchema,
  updateDiagnosticEducatifTemplateSchema,
} from '../schemas/diagnosticEducatif.schema'

const diagnosticEducatifTemplateRouter: FastifyPluginAsync = (fastify) => {
  const { diagnosticEducatifTemplateDomain } = fastify.iocContainer

  // Get all
  fastify.get('/', {
    schema: { response: { 200: diagnosticEducatifTemplatesResponseSchema } },
    onRequest: [fastify.verifySessionCookie],
  }, () => diagnosticEducatifTemplateDomain.findAll())

  // Get by ID
  fastify.get<{ Params: DiagnosticTemplateParams }>('/:templateId', {
    schema: {
      params: diagnosticTemplateParamsSchema,
      response: { 200: diagnosticEducatifTemplateResponseSchema, 404: z.object({ message: z.string() }) },
    },
    onRequest: [fastify.verifySessionCookie],
  }, async (request) => {
    const template = await diagnosticEducatifTemplateDomain.findByID(request.params.templateId)
    if (!template) throw Boom.notFound('Template not found')
    return template
  })

  // Create
  fastify.post<{ Body: CreateDiagnosticEducatifTemplateBody }>('/', {
    schema: { body: createDiagnosticEducatifTemplateSchema, response: { 201: diagnosticEducatifTemplateResponseSchema } },
    onRequest: [fastify.verifySessionCookie],
  }, async (request, reply) => {
    const template = await diagnosticEducatifTemplateDomain.create(request.body)
    reply.code(201)
    return template
  })

  // Update
  fastify.patch<{ Params: UpdateDiagnosticEducatifTemplateParams; Body: UpdateDiagnosticEducatifTemplateBody }>('/:templateId', {
    schema: { ...updateDiagnosticEducatifTemplateSchema, response: { 200: diagnosticEducatifTemplateResponseSchema } },
    onRequest: [fastify.verifySessionCookie],
  }, async (request) => {
    return diagnosticEducatifTemplateDomain.update(request.params.templateId, request.body)
  })

  // Delete
  fastify.delete<{ Params: DiagnosticTemplateParams }>('/:templateId', {
    schema: { params: diagnosticTemplateParamsSchema, response: { 204: z.null() } },
    onRequest: [fastify.verifySessionCookie],
  }, async (request, reply) => {
    await diagnosticEducatifTemplateDomain.delete(request.params.templateId)
    reply.code(204).send()
  })

  return Promise.resolve()
}

export { diagnosticEducatifTemplateRouter }
