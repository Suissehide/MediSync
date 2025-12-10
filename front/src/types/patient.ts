export type Patient = {
  id: string

  // Identity
  firstName: string
  lastName: string
  gender?: string
  birthDate?: string

  // Contact
  phone1?: string
  phone2?: string
  email?: string

  // Personal & Social Info
  distance?: string // Distance d'habitation
  educationLevel?: string // Niveau d’étude
  occupation?: string // Profession
  currentActivity?: string // Activité actuelle

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
  stopReason?: string // Motif d’arrêt de programme
  etpFinalOutcome?: string // Point final parcours ETP
}

export type CreatePatientParams = Omit<Patient, 'id'>
export type UpdatePatientParams = Patient
