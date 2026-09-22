import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import { hasPermission } from '../../../../utils/permissions'

import {
  type CreatePatientBody,
  createPatientSchema,
  type DeletePatientByIdParams,
  deletePatientByIdParamsSchema,
  type EnrollExistingPatientInPathwaysBody,
  type EnrollPatientInPathwaysBody,
  enrollExistingPatientInPathwaysSchema,
  enrollmentResultSchema,
  enrollPatientInPathwaysSchema,
  type GetPatientByIdParams,
  getPatientByIdParamsSchema,
  patientResponseSchema,
  patientsResponseSchema,
  patientsWithTagsResponseSchema,
  type UpdatePatientBody,
  type UpdatePatientParams,
  updatePatientByIdSchema,
  type PatientPathwayParams,
  patientPathwayParamsSchema,
  appointmentsCountResponseSchema,
  removeFromPathwayResponseSchema,
  patientPathwaysResponseSchema,
  reorderPatientPathwaysBodySchema,
  type ReorderPatientPathwaysBody,
} from '../schemas/patient.schema'

const patientRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { patientDomain, logger } = iocContainer

  // Get all
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: patientsResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'patient:read' },
    },
    () => {
      return patientDomain.findAll()
    },
  )

  // Export patients as Excel (must be before /:patientID)
  fastify.get(
    '/export',
    {
      schema: {
        querystring: z.object({
          search: z.string().optional(),
          pathwayTemplateTags: z.union([z.string(), z.array(z.string())]).optional(),
        }),
      },
      config: { permission: 'patient:read' },
    },
    async (request, reply) => {
      const { search, pathwayTemplateTags } = request.query as {
        search?: string
        pathwayTemplateTags?: string | string[]
      }

      const tags = pathwayTemplateTags
        ? Array.isArray(pathwayTemplateTags)
          ? pathwayTemplateTags
          : [pathwayTemplateTags]
        : []

      // L'export est un Buffer : le hook `preSerialization` qui retire les
      // champs cliniques des réponses JSON ne s'y applique pas, il faut donc
      // décider ici de la présence des colonnes cliniques.
      const { serviceRole, establishmentRole } = request.tenant
      const buffer = await patientDomain.exportExcel(
        { search, pathwayTemplateTags: tags },
        {
          includeClinicalFields: hasPermission(
            { serviceRole, establishmentRole },
            'clinical:read',
          ),
        },
      )

      const filename = `patients_${new Date().toISOString().slice(0, 10)}.xlsx`
      await reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer)
    },
  )

  // Get all with pathway template tags (must be before /:patientID)
  fastify.get(
    '/with-tags',
    {
      schema: {
        response: { 200: patientsWithTagsResponseSchema },
      },
      config: { permission: 'patient:read' },
    },
    () => patientDomain.findAllWithTags(),
  )

  // Read by ID
  fastify.get<{ Params: GetPatientByIdParams }>(
    '/:patientID',
    {
      schema: {
        params: getPatientByIdParamsSchema,
        response: {
          200: patientResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'patient:read' },
    },
    async (request) => {
      const { patientID } = request.params
      const patient = await patientDomain.findByID(patientID)
      if (!patient) {
        throw Boom.notFound('Patient not found')
      }
      return patient
    },
  )

  // Create
  fastify.post<{ Body: CreatePatientBody }>(
    '/',
    {
      schema: {
        body: createPatientSchema,
        response: {
          201: patientResponseSchema,
        },
      },
      config: { permission: 'patient:write' },
    },
    async (request, reply) => {
      const patient = await patientDomain.create(request.body, request.user.userID)
      reply.code(201)
      return patient
    },
  )

  // Update
  fastify.patch<{ Params: UpdatePatientParams; Body: UpdatePatientBody }>(
    '/:patientID',
    {
      schema: {
        ...updatePatientByIdSchema,
        response: {
          200: patientResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'patient:write' },
    },
    async (request) => {
      const { patientID } = request.params
      const updated = await patientDomain.update(patientID, request.body, request.user.userID)
      if (!updated) {
        throw Boom.notFound('Patient not found')
      }
      return updated
    },
  )

  // Delete
  fastify.delete<{ Params: DeletePatientByIdParams }>(
    '/:patientID',
    {
      schema: {
        params: deletePatientByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'patient:delete' },
    },
    async (request, reply) => {
      const { patientID } = request.params
      const deleted = await patientDomain.delete(patientID, request.user.userID)
      if (!deleted) {
        logger.info('Patient not found')
        throw Boom.notFound('Patient not found')
      }
      reply.code(204).send()
    },
  )

  fastify.post<{ Body: EnrollPatientInPathwaysBody }>(
    '/enroll',
    {
      schema: {
        body: enrollPatientInPathwaysSchema,
        response: {
          201: enrollmentResultSchema,
          400: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'appointment:write' },
    },
    async (request, reply) => {
      const result = await patientDomain.enrollPatientInPathways({
        patientData: request.body.patientData,
        startDate: request.body.startDate,
        pathways: request.body.pathways,
      }, request.user.userID)
      reply.code(201)
      return result
    },
  )

  fastify.post<{ Body: EnrollExistingPatientInPathwaysBody }>(
    '/:patientID/enroll',
    {
      schema: {
        body: enrollExistingPatientInPathwaysSchema,
        response: {
          200: enrollmentResultSchema,
          400: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'appointment:write' },
    },
    async (request) => {
      return await patientDomain.enrollExistingPatientInPathways({
        patientID: request.body.patientID,
        startDate: request.body.startDate,
        pathways: request.body.pathways,
      }, request.user.userID)
    },
  )

  // Count appointments for patient in pathway (for confirmation modal)
  fastify.get<{ Params: PatientPathwayParams }>(
    '/:patientID/pathway/:pathwayID/appointments-count',
    {
      schema: {
        params: patientPathwayParamsSchema,
        response: {
          200: appointmentsCountResponseSchema,
        },
      },
      config: { permission: 'patient:read' },
    },
    (request) => {
      const { patientID, pathwayID } = request.params
      return patientDomain.countAppointmentsInPathway(patientID, pathwayID)
    },
  )

  // Remove patient from pathway
  fastify.delete<{ Params: PatientPathwayParams }>(
    '/:patientID/pathway/:pathwayID',
    {
      schema: {
        params: patientPathwayParamsSchema,
        response: {
          200: removeFromPathwayResponseSchema,
        },
      },
      config: { permission: 'appointment:write' },
    },
    (request) => {
      const { patientID, pathwayID } = request.params
      return patientDomain.removeFromPathway(
        patientID,
        pathwayID,
        request.user.userID,
      )
    },
  )

  // Get all pathways for a patient (with priority order)
  fastify.get<{ Params: GetPatientByIdParams }>(
    '/:patientID/pathways',
    {
      schema: {
        params: getPatientByIdParamsSchema,
        response: {
          200: patientPathwaysResponseSchema,
        },
      },
      config: { permission: 'patient:read' },
    },
    (request) => {
      return patientDomain.getPathways(request.params.patientID)
    },
  )

  // Reorder patient pathways by priority
  fastify.put<{
    Params: GetPatientByIdParams
    Body: ReorderPatientPathwaysBody
  }>(
    '/:patientID/pathway-priorities',
    {
      schema: {
        params: getPatientByIdParamsSchema,
        body: reorderPatientPathwaysBodySchema,
        response: {
          204: z.null(),
        },
      },
      config: { permission: 'patient:write' },
    },
    async (request, reply) => {
      await patientDomain.setPathwayPriorities(
        request.params.patientID,
        request.body.pathwayIDs,
      )
      return reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { patientRouter }
