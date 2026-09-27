import type { AppointmentType } from '../../../generated/enums'
import type { TimeOfDay } from '../../interfaces/http/fastify/schemas/patient.schema'
import type {
  PatientCreateEntityRepo,
  PatientEntityRepo,
  PatientIdentitySearchFilters,
  PatientIdentitySearchResultRepo,
  PatientUpdateEntityRepo,
  PatientWithTagsEntityRepo,
} from '../infra/orm/repositories/patient.repository.interface'
import type { AppointmentEntityDomain } from './appointment.domain.interface'
import type { AppointmentPatientEntityDomain } from './appointmentPatient.domain.interface'
import type { EnrollmentIssueEntityDomain } from './enrollmentIssue.domain.interface'

export type PatientEntityDomain = PatientEntityRepo
export type PatientWithTagsDomain = PatientWithTagsEntityRepo
export type PatientIdentityMatchDomain = PatientIdentitySearchResultRepo
// Recherche d'identite : `hasMore` dit qu'il y a plus de vingt resultats, jamais combien (revue
// tache 13, tour 1, point 4) — voir le commentaire de `patientIdentitySearchResponseSchema`.
export type PatientIdentitySearchResultDomain = {
  results: PatientIdentityMatchDomain[]
  hasMore: boolean
}
export type PatientWithAppointmentsDomain = PatientEntityDomain & {
  appointmentPatients: (AppointmentPatientEntityDomain & {
    appointment: AppointmentEntityDomain
  })[]
  enrollmentIssues: EnrollmentIssueEntityDomain[]
}
// Signal de suivi ailleurs (spec §5.3/§6, tache 7 tour 1, I1) porte par la lecture du patient,
// pas par celle du sous-dossier : voir PatientDomain.findByID.
//
// `followedElsewhere?` (revue tache 13, tour 1, point 1) : absent quand le service courant n'a
// pas encore de sous-dossier pour ce patient — jamais `false` dans ce cas, un `false` dirait
// « je sais, et c'est non ». Voir le commentaire de `patientDetailResponseSchema`.
export type PatientDetailDomain = PatientWithAppointmentsDomain & { followedElsewhere?: boolean }
export type PatientCreateEntityDomain = Omit<
  PatientCreateEntityRepo,
  'createDate'
>
export type PatientUpdateEntityDomain = PatientUpdateEntityRepo

export type PathwayEnrollmentInput = {
  tag: string
  timeOfDay: TimeOfDay
  thematicID?: string
  type?: AppointmentType
  motif?: string
  duration?: number
}

export type EnrollPatientInPathwaysInput = {
  patientData: PatientCreateEntityDomain
  startDate: Date
  pathways: PathwayEnrollmentInput[]
}

export type EnrollExistingPatientInPathwaysInput = {
  patientID: string
  startDate: Date
  pathways: PathwayEnrollmentInput[]
}

export type EnrollmentAppointment = {
  id?: string
  startDate?: Date
  endDate?: Date
  success: boolean
  error?: string
}

export type EnrollmentResult = {
  patient: PatientEntityDomain
  enrollments: {
    slotTemplate: {
      id: string
      name?: string
    }
    appointments: EnrollmentAppointment[]
  }[]
  failedEnrollments: {
    slotTemplate: {
      id: string
      name?: string
    }
    reason: string
  }[]
}

export type PatientExportFilters = {
  search?: string
  pathwayTemplateTags?: string[]
}

// L'export Excel est un Buffer : le hook `preSerialization` qui retire les
// champs cliniques des réponses JSON ne le voit pas. L'appelant doit donc
// dire explicitement s'il a `clinical:read`.
export type PatientExportOptions = { includeClinicalFields: boolean }

// `count` (etape 4b, tache 4) : le nombre de dossiers effectivement rendus par l'export,
// necessaire au handler (`routes/patient.ts`) pour poser `request.patientExportCount` avant de
// repondre -- le journal des consultations (`recordPatientAccess`, plugins/tenant.plugin.ts) en
// a besoin et ne peut pas le recalculer lui-meme sans rejouer integralement la meme requete.
// `patients.length` est deja calcule ici pour construire les lignes du classeur ; l'exposer
// coute une propriete, pas une seconde requete.
export type PatientExportResult = { buffer: Buffer; count: number }

export type RemoveFromPathwayResult = {
  deletedAppointments: number
  removedFromGroup: number
}

export type PatientPathwayDomain = {
  pathwayID: string
  templateID: string | null
  templateName: string | null
  templateColor: string | null
  templateMainTag: string | null
  startDate: Date
  priority: number | null
}

export interface PatientDomainInterface {
  findAll: () => Promise<PatientEntityDomain[]>
  findAllWithTags: () => Promise<PatientWithTagsDomain[]>
  searchByIdentity: (
    filters: PatientIdentitySearchFilters,
  ) => Promise<PatientIdentitySearchResultDomain>
  findByID: (patientID: string) => Promise<PatientDetailDomain>
  exportExcel: (
    filters: PatientExportFilters,
    options: PatientExportOptions,
  ) => Promise<PatientExportResult>
  create: (
    patientCreateParams: PatientCreateEntityDomain,
    userID: string,
  ) => Promise<PatientEntityDomain>
  update: (
    patientID: string,
    patientUpdateParams: PatientUpdateEntityDomain,
    userID: string,
  ) => Promise<PatientEntityDomain>
  delete: (patientID: string, userID: string) => Promise<PatientEntityDomain>
  enrollPatientInPathways: (
    enrollmentData: EnrollPatientInPathwaysInput,
    userID: string,
  ) => Promise<EnrollmentResult>
  enrollExistingPatientInPathways: (
    enrollmentData: EnrollExistingPatientInPathwaysInput,
    userID: string,
  ) => Promise<EnrollmentResult>
  countAppointmentsInPathway: (
    patientID: string,
    pathwayID: string,
  ) => Promise<{ count: number }>
  removeFromPathway: (
    patientID: string,
    pathwayID: string,
    userID: string,
  ) => Promise<RemoveFromPathwayResult>
  getPathways: (patientID: string) => Promise<PatientPathwayDomain[]>
  setPathwayPriorities: (
    patientID: string,
    orderedPathwayIDs: string[],
  ) => Promise<void>
}
