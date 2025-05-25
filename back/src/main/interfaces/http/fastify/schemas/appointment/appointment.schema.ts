import { z } from 'zod'

const appointmentEntity = {
  startDate: z.date(),
  endDate: z.date(),
}

export const appointmentSchema = z.object({
  ...appointmentEntity,
})

export const getAppointmentsByIdParamsSchema = z.object({
  appointmentID: z.string().cuid(),
})

export const appointmentResponseSchema = z.object({
  ...appointmentEntity,
  id: z.string(),
})

export type appointmentInput = z.infer<typeof appointmentSchema>
