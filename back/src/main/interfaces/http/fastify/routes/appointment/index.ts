import { z } from 'zod'
import {
  appointmentResponseSchema,
  getAppointmentsByIdParamsSchema,
} from '../../schemas/appointment/appointment.schema'
import Boom from '@hapi/boom'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

const appointmentRouter: FastifyPluginAsyncZod = (fastify) => {
  const { iocContainer } = fastify
  const { appointmentDomain, logger } = iocContainer

  fastify.get(
    '/:appointmentId',
    {
      schema: {
        params: getAppointmentsByIdParamsSchema,
        response: {
          200: appointmentResponseSchema,
          404: z.object({ message: z.string() }),
        },
        tags: ['Appointment'],
      },
    },
    async (request) => {
      const { success, data, error } =
        getAppointmentsByIdParamsSchema.safeParse(request.params)
      if (!success) {
        logger.info(
          `req body: ${JSON.stringify(request.body)}, error: ${error.message}`,
        )
        throw Boom.badRequest('Appointment ID is missing or bad formatted')
      }

      const { appointmentID } = data
      const appointment = await appointmentDomain.findByID(appointmentID)
      if (!appointment) {
        throw Boom.notFound('Appointment not found')
      }
      return appointment
    },
  )

  return Promise.resolve()
}

export { appointmentRouter }
