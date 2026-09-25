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

  // Enrollment
  enrollmentIssues?: EnrollmentIssue[]

  // Suivi ailleurs : ce patient a-t-il au moins un sous-dossier dans un autre service du même
  // établissement (étape 3 du multi-tenant). Vit sur le patient, pas sur `PatientServiceFile`
  // (`types/patientServiceFile.ts`) : délibéré côté back, pour rester disponible avant même
  // qu'un sous-dossier de service existe pour ce patient — voir `patient.domain.ts#findByID`
  // (back) et la spec §5.3/§6. N'apparaît que sur la lecture détaillée d'un patient
  // (`patientDetailResponseSchema`), pas sur les listes ni sur create/update, d'où l'optionnel.
  // Son affichage est la tâche 14.
  followedElsewhere?: boolean
}

export type PatientWithTags = Patient & {
  pathwayTemplateTags: string[]
  // Date d'entrée dans le service courant : vit sur `PatientServiceFile`
  // (`types/patientServiceFile.ts`), mais `GET /patient/with-tags` joint déjà le sous-dossier
  // filtré sur le service courant et l'aplatit sur la ligne (back, `patient.repository.ts`
  // #findAllWithTags — tâche 12 du plan, pas la 11). N'existe donc que sur cette liste, pas sur
  // `Patient` en général (création/édition, qui passent par `PatientServiceFileApi`).
  entryDate?: string
}

export type EnrollmentIssue = {
  id: string
  pathwayName?: string | null
  pathwayTemplateID: string
  reason: string
  startDate: string
  createdAt: string
}

export type CreatePatientParams = Omit<Patient, 'id'>
export type UpdatePatientParams = Patient

export type TimeOfDay = 'ALL_DAY' | 'MORNING' | 'AFTERNOON'

export type PathwayEnrollment = {
  tag: string
  timeOfDay: TimeOfDay
  thematicID?: string
  type?: string
  motif?: string
  duration?: number
}

export type EnrollPatientParams = {
  patientData: CreatePatientParams
  startDate: string
  pathways: PathwayEnrollment[]
}

export type EnrollExistingPatientParams = {
  patientID: string
  startDate: string
  pathways: PathwayEnrollment[]
}

export type EnrollmentResult = {
  patient: Patient
  enrollments: {
    slotTemplate: { id: string; name?: string }
    appointments: { id?: string; startDate?: string; endDate?: string; success: boolean; error?: string }[]
  }[]
  failedEnrollments: {
    slotTemplate: { id: string; name?: string }
    reason: string
  }[]
}

export type PatientPathway = {
  pathwayID: string
  templateID: string | null
  templateName: string | null
  templateColor: string | null
  templateMainTag: string | null
  startDate: string
  priority: number | null
}
