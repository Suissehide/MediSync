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
export type PatientWithAppointmentsDomain = PatientEntityDomain & {
  appointmentPatients: (AppointmentPatientEntityDomain & {
    appointment: AppointmentEntityDomain
  })[]
  enrollmentIssues: EnrollmentIssueEntityDomain[]
}
// Signal de suivi ailleurs (spec §5.3/§6, tache 7 tour 1, I1) porte par la lecture du patient,
// pas par celle du sous-dossier : voir PatientDomain.findByID.
export type PatientDetailDomain = PatientWithAppointmentsDomain & { followedElsewhere: boolean }
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
  ) => Promise<PatientIdentityMatchDomain[]>
  findByID: (patientID: string) => Promise<PatientDetailDomain>
  exportExcel: (
    filters: PatientExportFilters,
    options: PatientExportOptions,
  ) => Promise<Buffer>
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
