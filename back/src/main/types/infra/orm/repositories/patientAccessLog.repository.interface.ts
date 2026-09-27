import type { PatientAccessLog } from '../../../../../generated/client'

export type PatientAccessLogEntityRepo = PatientAccessLog

// Omet `establishmentId`/`serviceId` : c'est le depot qui les pose depuis
// `tenantContext.scope()`, jamais l'appelant (voir service.repository.ts, le modele explicite
// du cahier des charges de cette tache).
//
// `accesParOctroi` (decision du 2026-09-27, etape 4b) N'EST PAS dans `RecordAccessInput`
// (types/domain/patientAccessLog.domain.interface.ts) : c'est `PatientAccessLogDomain.record`
// qui la calcule depuis `tenantContext.current().origine` et la fournit ici, exactement comme
// `ServiceRepository.create` recoit `creatorUserId` du domaine plutot que de l'appelant HTTP.
export type PatientAccessLogCreateEntityRepo = {
  // Optionnel depuis la tache 4 (etape 4b) : une ligne d'export n'a pas d'identifiant de patient
  // (voir le commentaire de `RecordAccessInput`, types/domain/patientAccessLog.domain.interface.ts).
  patientId?: string
  userID: string
  userFirstName: string | null
  userLastName: string | null
  action: string
  exportCount?: number
  exportFilters?: string
  accesParOctroi: boolean
}

export interface PatientAccessLogRepositoryInterface {
  create: (params: PatientAccessLogCreateEntityRepo) => Promise<PatientAccessLogEntityRepo>
  // Etape 4b, tache 5 : les deux premieres LECTURES du journal. `findByPatientInService` filtre
  // par `tenantContext.scope()` (establishmentId + serviceId du tenant courant) : c'est ce filtre
  // qui isole les acces d'un service de ceux d'un autre, jamais un `where` recopie a la main.
  // `findByPatientInEstablishment` filtre par `tenantContext.establishmentScope()` (establishmentId
  // seul) : elle rend les acces de TOUS les services de l'etablissement, pour l'administrateur.
  findByPatientInService: (patientId: string) => Promise<PatientAccessLogEntityRepo[]>
  findByPatientInEstablishment: (patientId: string) => Promise<PatientAccessLogEntityRepo[]>
}
