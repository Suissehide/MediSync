import { z } from 'zod/v4'
import type {
  CreateAppointmentBody,
  DeleteAppointmentByIdParams,
  GetAppointmentByIdParams,
  UpdateAppointmentBody,
  UpdateAppointmentParams,
} from '../schemas/appointment.schema'
import Boom from '@hapi/boom'
import {
  createAppointmentSchema,
  deleteAppointmentByIdParamsSchema,
  getAppointmentByIdParamsSchema,
  appointmentResponseSchema,
  appointmentsResponseSchema,
  updateAppointmentByIdSchema,
} from '../schemas/appointment.schema'
import type { FastifyPluginAsync } from 'fastify'

const appointmentRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { appointmentDomain, logger } = iocContainer

  // Get all
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: appointmentsResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    () => {
      return appointmentDomain.findAll()
    },
  )

  // Read by ID
  fastify.get<{ Params: GetAppointmentByIdParams }>(
    '/:appointmentID',
    {
      schema: {
        params: getAppointmentByIdParamsSchema,
        response: {
          200: appointmentResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { appointmentID } = request.params
      const appointment = await appointmentDomain.findByID(appointmentID)
      console.log(appointment)
      if (!appointment) {
        throw Boom.notFound('Appointment not found')
      }
      return appointment
    },
  )

  // Create
  fastify.post<{ Body: CreateAppointmentBody }>(
    '/',
    {
      schema: {
        body: createAppointmentSchema,
        response: {
          201: appointmentResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const appointment = await appointmentDomain.create(request.body)
      console.log('appointment', appointment)
      reply.code(201)
      return appointment
    },
  )

  // Update
  fastify.patch<{
    Params: UpdateAppointmentParams
    Body: UpdateAppointmentBody
  }>(
    '/:appointmentID',
    {
      schema: {
        ...updateAppointmentByIdSchema,
        response: {
          200: appointmentResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const { appointmentID } = request.params
      const updated = await appointmentDomain.update(
        appointmentID,
        request.body,
      )
      if (!updated) {
        throw Boom.notFound('Appointment not found')
      }
      return updated
    },
  )

  // Delete
  fastify.delete<{ Params: DeleteAppointmentByIdParams }>(
    '/:appointmentID',
    {
      schema: {
        params: deleteAppointmentByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { appointmentID } = request.params
      const deleted = await appointmentDomain.delete(appointmentID)
      if (!deleted) {
        logger.info('Appointment not found')
        throw Boom.notFound('Appointment not found')
      }
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { appointmentRouter }
