import { z } from 'zod'

const cell = z.object({
  absent: z.number(),
  pointed: z.number(),
  rate: z.number().nullable(),
})

export const activityReportResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  patients: z.object({
    active: z.number(),
    newlyIncluded: z.number(),
    exited: z.number(),
  }),
  completion: z.object({
    completed: z.number(),
    exited: z.number(),
    rate: z.number().nullable(),
    dropouts: z.number(),
    dropoutReasons: z.array(
      z.object({ reason: z.string(), count: z.number() }),
    ),
  }),
  absences: z.object({
    overall: cell,
    worst: z.object({ thematic: z.string(), weekday: z.number() }).nullable(),
    weekdays: z.array(z.number()),
    byThematic: z.array(
      z.object({ thematic: z.string(), total: cell, cells: z.array(cell) }),
    ),
    byPathway: z.array(z.object({ pathway: z.string(), cell })),
  }),
  sessions: z.object({
    individual: z.number(),
    collective: z.number(),
    educationalDiagnoses: z.number(),
    finalReviews: z.number(),
  }),
  hoursBySoignant: z.array(
    z.object({ soignant: z.string(), hours: z.number() }),
  ),
})
