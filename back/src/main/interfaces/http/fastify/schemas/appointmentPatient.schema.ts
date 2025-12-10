import { z } from 'zod/v4'

import { appointmentPatientSchema } from './index'
import { patientResponseSchema } from './patient.schema'

export const appointmentPatientResponseSchema = appointmentPatientSchema.extend(
  {
    id: z.cuid(),
    patient: patientResponseSchema.extend({
      id: z.cuid(),
    }),
  },
)

export const appointmentPatientsResponseSchema = z.array(
  appointmentPatientResponseSchema,
)

export const getAppointmentPatientByIdParamsSchema = z.object({
  appointmentID: z.cuid(),
})

export const createAppointmentPatientSchema = appointmentPatientSchema
  .pick({
    accompanying: true,
    status: true,
    rejectionReason: true,
    transmissionNotes: true,
  })
  .extend({
    patientID: z.cuid(),
  })

export const deleteAppointmentPatientByIdParamsSchema =
  getAppointmentPatientByIdParamsSchema

export const updateAppointmentPatientByIdSchema = {
  params: getAppointmentPatientByIdParamsSchema,
  body: appointmentPatientSchema.omit({ patient: true }).partial().extend({
    id: z.cuid().optional(),
    patientID: z.cuid(),
  }),
}

export type AppointmentPatientInput = z.infer<typeof appointmentPatientSchema>
export type GetAppointmentPatientByIdParams = z.infer<
  typeof getAppointmentPatientByIdParamsSchema
>
export type CreateAppointmentPatientBody = z.infer<
  typeof createAppointmentPatientSchema
>
export type UpdateAppointmentPatientParams = z.infer<
  typeof updateAppointmentPatientByIdSchema.params
>
export type UpdateAppointmentPatientBody = z.infer<
  typeof updateAppointmentPatientByIdSchema.body
>
export type DeleteAppointmentPatientByIdParams = z.infer<
  typeof deleteAppointmentPatientByIdParamsSchema
>
export type AppointmentPatientResponse = z.infer<
  typeof appointmentPatientResponseSchema
>
