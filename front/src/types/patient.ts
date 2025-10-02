export type Patient = {
  id: string

  // Identity
  lastName: string
  firstName: string
  gender?: string
  birthDate: Date

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
  followUpToDo?: boolean // Suivi à régulariser

  // Notes
  notes?: string
  details?: string

  // Inclusion Data
  medicalDiagnosis?: string
  entryDate?: Date
  careMode?: string // Mode de prise en charge
  orientation?: string
  etpDecision?: string // ETP décision
  programType?: string
  nonInclusionDetails?: string
  customContentDetails?: string
  goal?: string

  // Exit Data
  exitDate?: Date
  stopReason?: string // Motif d’arrêt de programme
  etpFinalOutcome?: string // Point final parcours ETP
}

export type CreatePatientParams = Omit<Patient, 'id'>
export type UpdatePatientParams = Patient
