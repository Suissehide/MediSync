import { z } from 'zod/v4'

import { cuid } from './id.schema'

export const enrollmentIssueResponseSchema = z.object({
  id: cuid(),
  patientId: z.string(),
  pathwayTemplateID: z.string(),
  pathwayName: z.string().optional().nullable(),
  reason: z.string(),
  startDate: z.coerce.date(),
  createdAt: z.coerce.date(),
})

export const enrollmentIssuesResponseSchema = z.array(
  enrollmentIssueResponseSchema,
)

export const enrollmentIssuePatientParamsSchema = z.object({
  patientID: cuid(),
})

export const enrollmentIssueParamsSchema = z.object({
  patientID: cuid(),
  issueID: cuid(),
})

export type EnrollmentIssueResponse = z.infer<
  typeof enrollmentIssueResponseSchema
>
export type EnrollmentIssuePatientParams = z.infer<
  typeof enrollmentIssuePatientParamsSchema
>
export type EnrollmentIssueParams = z.infer<typeof enrollmentIssueParamsSchema>
