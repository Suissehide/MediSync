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
}
