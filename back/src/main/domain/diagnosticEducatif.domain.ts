import type { IocContainer } from '../types/application/ioc'
import type {
  DiagnosticEducatifCreateEntity,
  DiagnosticEducatifDomainInterface,
  DiagnosticEducatifEntity,
  DiagnosticEducatifUpdateEntity,
} from '../types/domain/diagnosticEducatif.domain.interface'
import type { DiagnosticEducatifRepositoryInterface } from '../types/infra/orm/repositories/diagnosticEducatif.repository.interface'

class DiagnosticEducatifDomain implements DiagnosticEducatifDomainInterface {
  private readonly diagnosticEducatifRepository: DiagnosticEducatifRepositoryInterface

  constructor({ diagnosticEducatifRepository }: IocContainer) {
    this.diagnosticEducatifRepository = diagnosticEducatifRepository
  }

  findByPatientID(patientId: string): Promise<DiagnosticEducatifEntity[]> {
    return this.diagnosticEducatifRepository.findByPatientID(patientId)
  }

  findByID(id: string): Promise<DiagnosticEducatifEntity> {
    return this.diagnosticEducatifRepository.findByID(id)
  }

  create(params: DiagnosticEducatifCreateEntity): Promise<DiagnosticEducatifEntity> {
    return this.diagnosticEducatifRepository.create(params)
  }

  update(id: string, params: DiagnosticEducatifUpdateEntity): Promise<DiagnosticEducatifEntity> {
    return this.diagnosticEducatifRepository.update(id, params)
  }

  delete(id: string): Promise<DiagnosticEducatifEntity> {
    return this.diagnosticEducatifRepository.delete(id)
  }
}

export { DiagnosticEducatifDomain }
