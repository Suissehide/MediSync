import { z } from 'zod/v4'

import { patientSchema } from './patient.schema'
import { soignantSchema } from './soignant.schema'

export const appointmentSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  thematic: z.string().optional().nullable(),
  type: z.string().optional().nullable(),

  get slot() {
    return z.object(slotSchema).optional().nullable()
  },

  get appointmentPatients() {
    return z.array(appointmentPatientSchema).optional().nullable()
  },
})

export const appointmentPatientSchema = z.object({
  accompanying: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
  transmissionNotes: z.string().optional().nullable(),

  get patient() {
    return patientSchema.optional().nullable()
  },
})

/** Slot Template Schema */
export const slotTemplateSchema = z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  offsetDays: z.number(),

  thematic: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  color: z.string(),
  isIndividual: z.boolean(),
  capacity: z.number().optional().nullable(),
  duration: z.number().optional().nullable(),

  get soignant() {
    return soignantSchema.optional().nullable()
  },
  get template() {
    return pathwayTemplateSchema.optional().nullable()
  },
  get slots() {
    return slotSchema.optional().nullable()
  },
})

/** Slot Schema */
export const slotSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),

  get appointments() {
    return z.array(appointmentSchema).optional().nullable()
  },
  get pathway() {
    return pathwaySchema.optional().nullable()
  },
  get slotTemplate() {
    return slotTemplateSchema.optional().nullable()
  },
})

export const pathwayTemplateSchema = z.object({
  name: z.string().min(1),
  color: z.string(),

  get slotTemplates() {
    return z.array(slotTemplateSchema).optional().nullable()
  },
  // get pathways() {
  //   return z.array(pathwaySchema).optional().nullable()
  // },
})

export const pathwaySchema = z.object({
  startDate: z.coerce.date(),

  get template() {
    return pathwayTemplateSchema.optional().nullable()
  },
  get slots() {
    return z.array(slotSchema).optional().nullable()
  },
})
