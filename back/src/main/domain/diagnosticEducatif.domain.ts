import type { IocContainer } from '../types/application/ioc'
import type {
  DiagnosticEducatifCreateEntity,
  DiagnosticEducatifDomainInterface,
  DiagnosticEducatifEntity,
  DiagnosticEducatifUpdateEntity,
} from '../types/domain/diagnosticEducatif.domain.interface'
import type { PatientServiceFileDomainInterface } from '../types/domain/patientServiceFile.domain.interface'
import type { DiagnosticEducatifRepositoryInterface } from '../types/infra/orm/repositories/diagnosticEducatif.repository.interface'
import type { DiagnosticEducatifTemplateRepositoryInterface } from '../types/infra/orm/repositories/diagnosticEducatifTemplate.repository.interface'
import type { AppEventBus } from '../utils/app-event-bus'

class DiagnosticEducatifDomain implements DiagnosticEducatifDomainInterface {
  private readonly diagnosticEducatifRepository: DiagnosticEducatifRepositoryInterface
  private readonly diagnosticEducatifTemplateRepository: DiagnosticEducatifTemplateRepositoryInterface
  private readonly patientServiceFileDomain: PatientServiceFileDomainInterface
  private readonly appEventBus: AppEventBus

  constructor({
    diagnosticEducatifRepository,
    diagnosticEducatifTemplateRepository,
    patientServiceFileDomain,
    appEventBus,
  }: IocContainer) {
    this.diagnosticEducatifRepository = diagnosticEducatifRepository
    this.diagnosticEducatifTemplateRepository = diagnosticEducatifTemplateRepository
    this.patientServiceFileDomain = patientServiceFileDomain
    this.appEventBus = appEventBus
  }

  findByPatientID(patientId: string): Promise<DiagnosticEducatifEntity[]> {
    return this.diagnosticEducatifRepository.findByPatientID(patientId)
  }

  findByID(id: string): Promise<DiagnosticEducatifEntity> {
    return this.diagnosticEducatifRepository.findByID(id)
  }

  async create(params: DiagnosticEducatifCreateEntity, userID: string): Promise<DiagnosticEducatifEntity> {
    // `templateId` n'a pas de clé composite en base (nullable) : on vérifie
    // que le modèle appartient au tenant en le chargeant par son repository
    // filtré, qui répond 404 si il appartient à un autre service.
    if (params.templateId) {
      await this.diagnosticEducatifTemplateRepository.findByID(params.templateId)
    }
    // Le diagnostic pose une clé étrangère (patientId, serviceId) → PatientServiceFile (spec
    // §5.1) : garantir que le sous-dossier existe avant l'écriture, comme pour l'inscription en
    // parcours (voir PatientDomain.processEnrollments).
    await this.patientServiceFileDomain.ensureExists(params.patientId)
    const diag = await this.diagnosticEducatifRepository.create(params)
    this.appEventBus.emit('diagnostic.created', { userID, diagnosticId: diag.id })
    return diag
  }

  async update(id: string, params: DiagnosticEducatifUpdateEntity, userID: string): Promise<DiagnosticEducatifEntity> {
    // Voir create() : même vérification d'appartenance au tenant.
    if (typeof params.templateId === 'string') {
      await this.diagnosticEducatifTemplateRepository.findByID(params.templateId)
    }
    const diag = await this.diagnosticEducatifRepository.update(id, params)
    this.appEventBus.emit('diagnostic.updated', { userID, diagnosticId: diag.id })
    return diag
  }

  delete(id: string): Promise<DiagnosticEducatifEntity> {
    return this.diagnosticEducatifRepository.delete(id)
  }
}

export { DiagnosticEducatifDomain }
