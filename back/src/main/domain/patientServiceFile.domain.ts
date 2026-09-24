import type { IocContainer } from '../types/application/ioc'
import type {
  PatientServiceFileDomainInterface,
  PatientServiceFileEntityDomain,
  PatientServiceFileUpsertEntityDomain,
} from '../types/domain/patientServiceFile.domain.interface'
import type { PatientServiceFileRepositoryInterface } from '../types/infra/orm/repositories/patientServiceFile.repository.interface'
import type { AppEventBus } from '../utils/app-event-bus'

class PatientServiceFileDomain implements PatientServiceFileDomainInterface {
  private readonly patientServiceFileRepository: PatientServiceFileRepositoryInterface
  private readonly appEventBus: AppEventBus

  constructor({ patientServiceFileRepository, appEventBus }: IocContainer) {
    this.patientServiceFileRepository = patientServiceFileRepository
    this.appEventBus = appEventBus
  }

  findByPatient(patientId: string): Promise<PatientServiceFileEntityDomain | null> {
    return this.patientServiceFileRepository.findByPatient(patientId)
  }

  async upsert(
    patientId: string,
    params: PatientServiceFileUpsertEntityDomain,
    userID: string,
  ): Promise<PatientServiceFileEntityDomain> {
    const serviceFile = await this.patientServiceFileRepository.upsert(patientId, params)
    // Meme evenement que PATCH /patient/:id ('patient.updated' -> ActivityLogSubscriber) : le
    // sous-dossier porte le contenu clinique qui vivait avant sur le patient, et sa modification
    // doit laisser la meme trace dans le journal d'activite (voir back/src/main/services/
    // activity-log.subscriber.ts). Aucun evenement dedie : ce reste une modification du dossier
    // du meme patient, journalisee sous la meme entite.
    this.appEventBus.emit('patient.updated', { userID, patientId: serviceFile.patientId })
    return serviceFile
  }

  ensureExists(patientId: string): Promise<void> {
    return this.patientServiceFileRepository.ensureExists(patientId)
  }
}

export { PatientServiceFileDomain }
