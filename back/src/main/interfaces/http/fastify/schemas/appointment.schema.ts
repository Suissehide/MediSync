import { z } from 'zod/v4'
import { appointmentSchema } from './index'
import { patientResponseSchema } from './patient.schema'

export const appointmentResponseSchema = appointmentSchema.extend({
  id: z.cuid(),
  patients: z.array(
    patientResponseSchema.extend({
      id: z.cuid(),
    }),
  ),
})

export const appointmentsResponseSchema = z.array(appointmentResponseSchema)

export const getAppointmentByIdParamsSchema = z.object({
  appointmentID: z.cuid(),
})

export const createAppointmentSchema = appointmentSchema
  .pick({
    startDate: true,
    endDate: true,
    thematic: true,
    type: true,
    accompanying: true,
    status: true,
    rejectionReason: true,
    transmissionNotes: true,
  })
  .extend({
    slotID: z.cuid(),
    patientIDs: z.array(z.cuid()),
  })

export const deleteAppointmentByIdParamsSchema = getAppointmentByIdParamsSchema

export const updateAppointmentByIdSchema = {
  params: getAppointmentByIdParamsSchema,
  body: appointmentSchema
    .omit({ slot: true, patients: true })
    .partial()
    .extend({
      slotID: z.cuid().optional(),
      patientIDs: z.array(z.cuid()),
    }),
}

export type AppointmentInput = z.infer<typeof appointmentSchema>
export type GetAppointmentByIdParams = z.infer<
  typeof getAppointmentByIdParamsSchema
>
export type CreateAppointmentBody = z.infer<typeof createAppointmentSchema>
export type UpdateAppointmentParams = z.infer<
  typeof updateAppointmentByIdSchema.params
>
export type UpdateAppointmentBody = z.infer<
  typeof updateAppointmentByIdSchema.body
>
export type DeleteAppointmentByIdParams = z.infer<
  typeof deleteAppointmentByIdParamsSchema
>
export type AppointmentResponse = z.infer<typeof appointmentResponseSchema>
