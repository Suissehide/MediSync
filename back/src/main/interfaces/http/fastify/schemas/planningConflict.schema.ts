import { z } from 'zod/v4'

import { cuid } from './id.schema'

export const planningConflictSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('salle'),
    slotIDs: z.array(cuid()),
    locationID: cuid(),
  }),
  z.object({
    type: z.literal('patient'),
    slotIDs: z.array(cuid()),
    appointmentIDs: z.array(cuid()),
    patientID: cuid(),
  }),
  z.object({
    type: z.literal('capacite'),
    slotIDs: z.array(cuid()),
    appointmentID: cuid(),
    capacity: z.number(),
    count: z.number(),
  }),
])

export const planningConflictsSchema = z.array(planningConflictSchema)

// Memes bornes que GET /slot : `from` inclusive, `to` exclusive.
export const getPlanningConflictsQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
})

export type GetPlanningConflictsQuery = z.infer<
  typeof getPlanningConflictsQuerySchema
>
