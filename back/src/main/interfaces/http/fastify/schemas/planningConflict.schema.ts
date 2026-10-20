import { z } from 'zod/v4'

export const planningConflictSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('salle'),
    slotIDs: z.array(z.cuid()),
    locationID: z.cuid(),
  }),
  z.object({
    type: z.literal('patient'),
    slotIDs: z.array(z.cuid()),
    appointmentIDs: z.array(z.cuid()),
    patientID: z.cuid(),
  }),
  z.object({
    type: z.literal('capacite'),
    slotIDs: z.array(z.cuid()),
    appointmentID: z.cuid(),
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
