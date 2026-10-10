import type { FieldValues } from './serviceField.ts'

// Sous-dossier d'un patient pour le service courant ; `followedElsewhere` reste sur `Patient`.
export type PatientServiceFile = {
  id: string
  patientId: string
  serviceId: string
  establishmentId: string
  createdAt: string

  // Referrals & Context
  referringCaregiver?: string // Soignant référent
  followUpToDo?: string // Suivi à régulariser

  // Notes
  notes?: string
  details?: string

  entryDate?: string
  exitDate?: string

  // Champs configurables du service, par clé ; `clinicalData` absent sans `clinical:read`.
  data: FieldValues
  clinicalData?: FieldValues
}

// Corps du PATCH : tous les champs facultatifs — une charge partielle fait une mise à
// jour partielle (voir `patientServiceFile.api.ts` et la route back pour la raison du PATCH).
export type UpdatePatientServiceFileFields = Partial<
  Omit<
    PatientServiceFile,
    'id' | 'patientId' | 'serviceId' | 'establishmentId' | 'createdAt'
  >
>

export type UpdatePatientServiceFileParams = UpdatePatientServiceFileFields & {
  patientID: string
}
