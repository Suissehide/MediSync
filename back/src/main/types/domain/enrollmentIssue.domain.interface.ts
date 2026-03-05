import type { EnrollmentIssueEntityRepo } from '../infra/orm/repositories/enrollmentIssue.repository.interface'

export type EnrollmentIssueEntityDomain = EnrollmentIssueEntityRepo

export interface EnrollmentIssueDomainInterface {
  findByPatientID: (patientID: string) => Promise<EnrollmentIssueEntityDomain[]>
  delete: (issueID: string) => Promise<void>
}
