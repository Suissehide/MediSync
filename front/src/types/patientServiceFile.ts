// Sous-dossier d'un patient pour le service courant (étape 3 du multi-tenant) : les seize
// champs de parcours quittent `Patient` (partagé entre services) pour vivre ici, un par couple
// patient/service. Mêmes seize noms, même forme optionnelle, que ceux qu'ils remplacent dans
// `types/patient.ts` — voir ce fichier pour l'historique. Le signal de suivi ailleurs
// (`followedElsewhere`) n'est PAS ici : il reste sur `Patient`, disponible même quand ce
// sous-dossier n'existe pas encore (voir `patient.ts`).
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

  // Inclusion Data
  medicalDiagnosis?: string
  entryDate?: string
  careMode?: string // Mode de prise en charge
  orientation?: string
  etpDecision?: string // ETP décision
  programType?: string
  nonInclusionDetails?: string
  customContentDetails?: string
  goal?: string

  // Exit Data
  exitDate?: string
  stopReason?: string // Motif d'arrêt de programme
  etpFinalOutcome?: string // Point final parcours ETP
}

// Corps du PATCH : les seize champs, tous facultatifs — une charge partielle fait une mise à
// jour partielle (voir `patientServiceFile.api.ts` et la route back pour la raison du PATCH).
export type UpdatePatientServiceFileFields = Omit<
  PatientServiceFile,
  'id' | 'patientId' | 'serviceId' | 'establishmentId' | 'createdAt'
>

export type UpdatePatientServiceFileParams = UpdatePatientServiceFileFields & {
  patientID: string
}
