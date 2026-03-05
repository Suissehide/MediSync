import { z } from 'zod/v4'

export const enrollmentIssueResponseSchema = z.object({
  id: z.cuid(),
  patientId: z.string(),
  pathwayTemplateID: z.string(),
  pathwayName: z.string().optional().nullable(),
  reason: z.string(),
  startDate: z.coerce.date(),
  createdAt: z.coerce.date(),
})

export const enrollmentIssuesResponseSchema = z.array(enrollmentIssueResponseSchema)

export const enrollmentIssuePatientParamsSchema = z.object({
  patientID: z.cuid(),
})

export const enrollmentIssueParamsSchema = z.object({
  patientID: z.cuid(),
  issueID: z.cuid(),
})

export type EnrollmentIssueResponse = z.infer<typeof enrollmentIssueResponseSchema>
export type EnrollmentIssuePatientParams = z.infer<typeof enrollmentIssuePatientParamsSchema>
export type EnrollmentIssueParams = z.infer<typeof enrollmentIssueParamsSchema>
