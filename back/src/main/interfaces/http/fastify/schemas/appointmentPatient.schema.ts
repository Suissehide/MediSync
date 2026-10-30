import { z } from 'zod/v4'

import { cuid } from './id.schema'
import { appointmentPatientSchema } from './index'
import { patientResponseSchema } from './patient.schema'

export const appointmentPatientResponseSchema = appointmentPatientSchema.extend(
  {
    id: cuid(),
    patient: patientResponseSchema.extend({
      id: cuid(),
    }),
  },
)

export const appointmentPatientsResponseSchema = z.array(
  appointmentPatientResponseSchema,
)

export const getAppointmentPatientByIdParamsSchema = z.object({
  appointmentID: cuid(),
})

export const createAppointmentPatientSchema = appointmentPatientSchema
  .pick({
    accompanying: true,
    status: true,
    rejectionReason: true,
    transmissionNotes: true,
    convocationSent: true,
  })
  .extend({
    patientID: cuid(),
  })

export const deleteAppointmentPatientByIdParamsSchema =
  getAppointmentPatientByIdParamsSchema

export const updateAppointmentPatientByIdSchema = {
  params: getAppointmentPatientByIdParamsSchema,
  body: appointmentPatientSchema.omit({ patient: true }).partial().extend({
    id: cuid().optional(),
    patientID: cuid(),
  }),
}

export const setConvocationSentSchema = {
  params: z.object({
    appointmentID: cuid(),
    appointmentPatientID: cuid(),
  }),
  body: z.object({ convocationSent: z.boolean() }),
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
export type SetConvocationSentParams = z.infer<
  typeof setConvocationSentSchema.params
>
export type SetConvocationSentBody = z.infer<
  typeof setConvocationSentSchema.body
>
