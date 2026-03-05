import type { EnrollmentIssue } from '../../../../../generated/client'

export type EnrollmentIssueEntityRepo = EnrollmentIssue
export type EnrollmentIssueCreateEntityRepo = {
  pathwayTemplateID: string
  pathwayName?: string
  reason: string
  startDate: Date
}

export interface EnrollmentIssueRepositoryInterface {
  findByPatientID: (patientID: string) => Promise<EnrollmentIssueEntityRepo[]>
  create: (
    patientID: string,
    issues: EnrollmentIssueCreateEntityRepo[],
  ) => Promise<void>
  delete: (issueID: string) => Promise<void>
}
