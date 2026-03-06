import type { IocContainer } from '../types/application/ioc'
import type {
  DiagnosticEducatifCreateEntity,
  DiagnosticEducatifDomainInterface,
  DiagnosticEducatifEntity,
  DiagnosticEducatifUpdateEntity,
} from '../types/domain/diagnosticEducatif.domain.interface'
import type { DiagnosticEducatifRepositoryInterface } from '../types/infra/orm/repositories/diagnosticEducatif.repository.interface'
import type { AppEventBus } from '../utils/app-event-bus'

class DiagnosticEducatifDomain implements DiagnosticEducatifDomainInterface {
  private readonly diagnosticEducatifRepository: DiagnosticEducatifRepositoryInterface
  private readonly appEventBus: AppEventBus

  constructor({ diagnosticEducatifRepository, appEventBus }: IocContainer) {
    this.diagnosticEducatifRepository = diagnosticEducatifRepository
    this.appEventBus = appEventBus
  }

  findByPatientID(patientId: string): Promise<DiagnosticEducatifEntity[]> {
    return this.diagnosticEducatifRepository.findByPatientID(patientId)
  }

  findByID(id: string): Promise<DiagnosticEducatifEntity> {
    return this.diagnosticEducatifRepository.findByID(id)
  }

  async create(params: DiagnosticEducatifCreateEntity, userID: string): Promise<DiagnosticEducatifEntity> {
    const diag = await this.diagnosticEducatifRepository.create(params)
    this.appEventBus.emit('diagnostic.created', { userID, diagnosticId: diag.id })
    return diag
  }

  async update(id: string, params: DiagnosticEducatifUpdateEntity, userID: string): Promise<DiagnosticEducatifEntity> {
    const diag = await this.diagnosticEducatifRepository.update(id, params)
    this.appEventBus.emit('diagnostic.updated', { userID, diagnosticId: diag.id })
    return diag
  }

  delete(id: string): Promise<DiagnosticEducatifEntity> {
    return this.diagnosticEducatifRepository.delete(id)
  }
}

export { DiagnosticEducatifDomain }
