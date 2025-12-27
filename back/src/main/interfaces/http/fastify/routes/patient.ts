import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

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
  type UpdatePatientBody,
  type UpdatePatientParams,
  updatePatientByIdSchema,
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
      onRequest: [fastify.verifySessionCookie],
    },
    () => {
      return patientDomain.findAll()
    },
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
    },
    async (request, reply) => {
      const patient = await patientDomain.create(request.body)
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
    },
    async (request) => {
      const { patientID } = request.params
      const updated = await patientDomain.update(patientID, request.body)
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
    },
    async (request, reply) => {
      const { patientID } = request.params
      const deleted = await patientDomain.delete(patientID)
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
    },
    async (request, reply) => {
      const result = await patientDomain.enrollPatientInPathways({
        patientData: request.body.patientData,
        startDate: request.body.startDate,
        pathways: request.body.pathways,
      })
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
    },
    async (request) => {
      return await patientDomain.enrollExistingPatientInPathways({
        patientID: request.body.patientID,
        startDate: request.body.startDate,
        pathways: request.body.pathways,
      })
    },
  )

  return Promise.resolve()
}

export { patientRouter }
