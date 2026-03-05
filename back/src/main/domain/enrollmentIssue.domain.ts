import type { IocContainer } from '../types/application/ioc'
import type {
  EnrollmentIssueEntityDomain,
  EnrollmentIssueDomainInterface,
} from '../types/domain/enrollmentIssue.domain.interface'
import type { EnrollmentIssueRepositoryInterface } from '../types/infra/orm/repositories/enrollmentIssue.repository.interface'

class EnrollmentIssueDomain implements EnrollmentIssueDomainInterface {
  private readonly enrollmentIssueRepository: EnrollmentIssueRepositoryInterface

  constructor({ enrollmentIssueRepository }: IocContainer) {
    this.enrollmentIssueRepository = enrollmentIssueRepository
  }

  findByPatientID(patientID: string): Promise<EnrollmentIssueEntityDomain[]> {
    return this.enrollmentIssueRepository.findByPatientID(patientID)
  }

  delete(issueID: string): Promise<void> {
    return this.enrollmentIssueRepository.delete(issueID)
  }
}

export { EnrollmentIssueDomain }
