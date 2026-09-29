import type {
  PatientServiceFileEntityRepo,
  PatientServiceFileUpsertEntityRepo,
} from '../infra/orm/repositories/patientServiceFile.repository.interface'

export type PatientServiceFileEntityDomain = PatientServiceFileEntityRepo
export type PatientServiceFileUpsertEntityDomain =
  PatientServiceFileUpsertEntityRepo

export interface PatientServiceFileDomainInterface {
  findByPatient: (
    patientId: string,
  ) => Promise<PatientServiceFileEntityDomain | null>
  upsert: (
    patientId: string,
    params: PatientServiceFileUpsertEntityDomain,
    userID: string,
  ) => Promise<PatientServiceFileEntityDomain>
  // Garantit que le sous-dossier existe, sans le modifier s'il existe deja. A appeler par tout
  // chemin qui cree un enfant de service rattache a un patient (EnrollmentIssue,
  // DiagnosticEducatif, …) avant l'ecriture de cet enfant — spec §5.1, "a l'inscription d'un
  // patient dans un parcours du service".
  ensureExists: (patientId: string) => Promise<void>
  // Rattache une identite existante au service courant (design §6, tache 13) : cree le
  // sous-dossier s'il n'existe pas encore (et le seul cas ou une trace est journalisee),
  // ne touche a rien s'il existe deja. Voir PatientServiceFileDomain.attachToCurrentService.
  attachToCurrentService: (
    patientId: string,
    userID: string,
  ) => Promise<{ patientId: string; alreadyFollowedHere: boolean }>
  // Signal de suivi ailleurs (spec §5.3) : vrai si ce patient a au moins un sous-dossier dans un
  // autre service du meme etablissement. Un booleen, rien d'autre — voir
  // PatientServiceFileRepository.estSuiviAilleurs pour l'exception au cloisonnement qui le
  // calcule.
  estSuiviAilleurs: (patientId: string) => Promise<boolean>
}
