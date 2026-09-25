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
  // (`types/patientServiceFile.ts`) — voir `patient.domain.ts#findByID` (back) et la spec
  // §5.3/§6. N'apparaît que sur la lecture détaillée d'un patient (`patientDetailResponseSchema`),
  // pas sur les listes ni sur create/update.
  //
  // `?` ici est un VRAI optionnel, pas seulement "absent des listes" (revu à la tâche 13, tour de
  // correction 1, point 1) : même sur la lecture détaillée, le champ est absent tant que le
  // service courant n'a pas lui-même un sous-dossier pour ce patient — jamais `false` dans ce
  // cas, un `false` dirait « je sais, et c'est non ». Sans cette garde, un `id` obtenu par la
  // recherche (`PatientIdentityMatch`, qui elle ne porte jamais ce champ) suffisait, avec
  // `GET /patient/:id`, à apprendre qu'un patient est suivi ailleurs sans jamais le suivre
  // soi-même — exactement ce que la spec §6 interdit. Son affichage est la tâche 14.
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

// Resultat d'une recherche d'identite existante avant creation (etape 3 du multi-tenant, tache
// 13) : UNIQUEMENT l'identite (id, prenom, nom, date de naissance) — jamais le suivi, jamais un
// service, jamais un contenu de dossier. Volontairement un type distinct de `Patient`, qui porte
// bien plus de champs : rien n'encourage ici a en lire un que la reponse back ne rend pas.
export type PatientIdentityMatch = {
  id: string
  firstName: string
  lastName: string
  birthDate?: string | null
}

// `hasMore` (étape 3 du multi-tenant, tâche 13, tour de correction 1, point 4) : la recherche
// s'arrête à vingt résultats (back, `IDENTITY_SEARCH_LIMIT`) — sur une fonction dont le seul but
// est d'éviter les doublons, ne pas le dire ferait croire à tort qu'une identité n'existe pas.
// `hasMore` dit seulement qu'il y en a PLUS de vingt, jamais combien exactement.
export type PatientIdentitySearchResult = {
  results: PatientIdentityMatch[]
  hasMore: boolean
}

export type SearchPatientIdentityParams = {
  firstName?: string
  lastName?: string
  birthDate?: string
}

// Reponse du rattachement d'une identite existante au service courant (POST .../service-file) :
// voir `PatientServiceFileApi.attachExisting`.
export type AttachExistingPatientResult = {
  patientId: string
  alreadyFollowedHere: boolean
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
