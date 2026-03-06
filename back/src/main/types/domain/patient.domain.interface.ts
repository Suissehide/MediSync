import type { TimeOfDay } from '../../interfaces/http/fastify/schemas/patient.schema'
import type {
  PatientCreateEntityRepo,
  PatientEntityRepo,
  PatientUpdateEntityRepo,
  PatientWithTagsEntityRepo,
} from '../infra/orm/repositories/patient.repository.interface'
import type { AppointmentEntityDomain } from './appointment.domain.interface'
import type { AppointmentPatientEntityDomain } from './appointmentPatient.domain.interface'
import type { EnrollmentIssueEntityDomain } from './enrollmentIssue.domain.interface'

export type PatientEntityDomain = PatientEntityRepo
export type PatientWithTagsDomain = PatientWithTagsEntityRepo
export type PatientWithAppointmentsDomain = PatientEntityDomain & {
  appointmentPatients: (AppointmentPatientEntityDomain & {
    appointment: AppointmentEntityDomain
  })[]
  enrollmentIssues: EnrollmentIssueEntityDomain[]
}
export type PatientCreateEntityDomain = Omit<
  PatientCreateEntityRepo,
  'createDate'
>
export type PatientUpdateEntityDomain = PatientUpdateEntityRepo

export type PathwayEnrollmentInput = {
  pathwayTemplateID: string
  timeOfDay: TimeOfDay
  thematic?: string
  type?: string
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

export interface PatientDomainInterface {
  findAll: () => Promise<PatientEntityDomain[]>
  findAllWithTags: () => Promise<PatientWithTagsDomain[]>
  findByID: (patientID: string) => Promise<PatientEntityDomain>
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
}
