import type {
  PatientServiceFile,
  Prisma,
} from '../../../../../generated/client'

export type PatientServiceFileEntityRepo = PatientServiceFile

// Le repository pose patientId, serviceId et establishmentId lui-meme : l'appelant ne les
// fournit pas. Derive de Prisma (comme PatientCreateEntityRepo) plutot qu'enumere a la main :
// patient.schema.ts reste le seul endroit du back ou ces seize colonnes sont ecrites en toutes
// lettres.
export type PatientServiceFileUpsertEntityRepo = Omit<
  Prisma.PatientServiceFileUncheckedCreateInput,
  'id' | 'patientId' | 'serviceId' | 'establishmentId' | 'createdAt' | 'diagnostics' | 'enrollmentIssues'
>

export interface PatientServiceFileRepositoryInterface {
  findByPatient: (patientId: string) => Promise<PatientServiceFileEntityRepo | null>
  upsert: (
    patientId: string,
    params: PatientServiceFileUpsertEntityRepo,
  ) => Promise<PatientServiceFileEntityRepo>
  // Cree le sous-dossier s'il n'existe pas encore, sans toucher a ses colonnes s'il existe deja.
  // Voir PatientServiceFileDomain.ensureExists pour qui l'appelle et pourquoi.
  ensureExists: (patientId: string) => Promise<void>
  // Signal de suivi ailleurs (design §5.3, tache 7) : vrai si ce patient a au moins un
  // sous-dossier dans un AUTRE service du MEME etablissement. Un booleen, rien d'autre — voir
  // PatientServiceFileRepository.estSuiviAilleurs pour la seule lecture de tout le back qui
  // traverse volontairement la frontiere entre services.
  estSuiviAilleurs: (patientId: string) => Promise<boolean>
}
