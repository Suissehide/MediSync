import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'
import {
  type CreateDiagnosticEducatifBody,
  type DiagnosticParams,
  type DiagnosticPatientParams,
  type UpdateDiagnosticEducatifBody,
  type UpdateDiagnosticEducatifParams,
  createDiagnosticEducatifSchema,
  diagnosticEducatifResponseSchema,
  diagnosticEducatifsResponseSchema,
  diagnosticParamsSchema,
  diagnosticPatientParamsSchema,
  updateDiagnosticEducatifSchema,
} from '../schemas/diagnosticEducatif.schema'

const diagnosticEducatifRouter: FastifyPluginAsync = (fastify) => {
  const { diagnosticEducatifDomain, diagnosticEducatifTemplateDomain } = fastify.iocContainer

  // Get all by patient
  fastify.get<{ Params: DiagnosticPatientParams }>('/', {
    schema: {
      params: diagnosticPatientParamsSchema,
      response: { 200: diagnosticEducatifsResponseSchema },
    },
    onRequest: [fastify.verifySessionCookie],
  }, (request) => diagnosticEducatifDomain.findByPatientID(request.params.patientId))

  // Get by ID
  fastify.get<{ Params: DiagnosticParams }>('/:diagnosticId', {
    schema: {
      params: diagnosticParamsSchema,
      response: { 200: diagnosticEducatifResponseSchema, 404: z.object({ message: z.string() }) },
    },
    onRequest: [fastify.verifySessionCookie],
  }, async (request) => {
    const diag = await diagnosticEducatifDomain.findByID(request.params.diagnosticId)
    if (!diag) throw Boom.notFound('DiagnosticEducatif not found')
    return diag
  })

  // Create
  fastify.post<{ Params: DiagnosticPatientParams; Body: CreateDiagnosticEducatifBody }>('/', {
    schema: {
      params: diagnosticPatientParamsSchema,
      body: createDiagnosticEducatifSchema,
      response: { 201: diagnosticEducatifResponseSchema },
    },
    onRequest: [fastify.verifySessionCookie],
  }, async (request, reply) => {
    const { templateId, ...rest } = request.body
    let activeFields: string[] = rest.activeFields ?? []

    if (templateId) {
      const template = await diagnosticEducatifTemplateDomain.findByID(templateId)
      activeFields = template.activeFields
    }

    const diag = await diagnosticEducatifDomain.create({
      ...rest,
      patientId: request.params.patientId,
      templateId: templateId ?? undefined,
      activeFields,
    })
    reply.code(201)
    return diag
  })

  // Update
  fastify.patch<{ Params: UpdateDiagnosticEducatifParams; Body: UpdateDiagnosticEducatifBody }>('/:diagnosticId', {
    schema: { ...updateDiagnosticEducatifSchema, response: { 200: diagnosticEducatifResponseSchema } },
    onRequest: [fastify.verifySessionCookie],
  }, async (request) => {
    return diagnosticEducatifDomain.update(request.params.diagnosticId, request.body)
  })

  // Delete
  fastify.delete<{ Params: DiagnosticParams }>('/:diagnosticId', {
    schema: { params: diagnosticParamsSchema, response: { 204: z.null() } },
    onRequest: [fastify.verifySessionCookie],
  }, async (request, reply) => {
    await diagnosticEducatifDomain.delete(request.params.diagnosticId)
    reply.code(204).send()
  })

  return Promise.resolve()
}

export { diagnosticEducatifRouter }
