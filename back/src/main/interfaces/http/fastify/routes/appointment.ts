import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import type {
  CreateAppointmentBody,
  DeleteAppointmentByIdParams,
  GetAppointmentByIdParams,
  UpdateAppointmentBody,
  UpdateAppointmentParams,
} from '../schemas/appointment.schema'
import {
  appointmentResponseSchema,
  appointmentsResponseSchema,
  appointmentWithConflictsResponseSchema,
  createAppointmentSchema,
  deleteAppointmentByIdParamsSchema,
  getAppointmentByIdParamsSchema,
  updateAppointmentByIdSchema,
} from '../schemas/appointment.schema'
import {
  type SetConvocationSentBody,
  type SetConvocationSentParams,
  setConvocationSentSchema,
} from '../schemas/appointmentPatient.schema'

const appointmentRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { appointmentDomain, slotDomain, logger } = iocContainer

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
      config: { permission: 'patient:read' },
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
      config: { permission: 'patient:read' },
    },
    async (request) => {
      const { appointmentID } = request.params
      const appointment = await appointmentDomain.findByID(appointmentID)
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
          201: appointmentWithConflictsResponseSchema,
        },
      },
      config: { permission: 'appointment:write' },
    },
    async (request, reply) => {
      const appointment = await appointmentDomain.create(
        request.body,
        request.user.userID,
      )
      reply.code(201)
      return {
        ...appointment,
        conflicts: await slotDomain.conflictsOf(appointment.slotID),
      }
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
          200: appointmentWithConflictsResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'appointment:write' },
    },
    async (request) => {
      const { appointmentID } = request.params

      const updated = await appointmentDomain.update(
        appointmentID,
        request.body,
        request.user.userID,
      )
      if (!updated) {
        throw Boom.notFound('Appointment not found')
      }
      // Une liste de patients vide a supprimé le rendez-vous : plus rien à signaler.
      const deleted = request.body.appointmentPatients?.length === 0
      return {
        ...updated,
        conflicts: deleted ? [] : await slotDomain.conflictsOf(updated.slotID),
      }
    },
  )

  // Convocation envoyée, cochée depuis l'agenda : ne touche qu'à ce champ.
  fastify.patch<{
    Params: SetConvocationSentParams
    Body: SetConvocationSentBody
  }>(
    '/:appointmentID/patients/:appointmentPatientID/convocation',
    {
      schema: {
        ...setConvocationSentSchema,
        response: { 204: z.null() },
      },
      config: { permission: 'appointment:write' },
    },
    async (request, reply) => {
      const { appointmentID, appointmentPatientID } = request.params
      await appointmentDomain.setConvocationSent(
        appointmentID,
        appointmentPatientID,
        request.body.convocationSent,
        request.user.userID,
      )
      reply.code(204).send()
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
      config: { permission: 'appointment:write' },
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
