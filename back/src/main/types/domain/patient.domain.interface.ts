import type { TimeOfDay } from '../../interfaces/http/fastify/schemas/patient.schema'
import type {
  PatientCreateEntityRepo,
  PatientEntityRepo,
  PatientUpdateEntityRepo,
} from '../infra/orm/repositories/patient.repository.interface'
import type { AppointmentEntityDomain } from './appointment.domain.interface'
import type { AppointmentPatientEntityDomain } from './appointmentPatient.domain.interface'

export type PatientEntityDomain = PatientEntityRepo
export type PatientWithAppointmentsDomain = PatientEntityDomain & {
  appointmentPatients: (AppointmentPatientEntityDomain & {
    appointment: AppointmentEntityDomain
  })[]
}
export type PatientCreateEntityDomain = Omit<
  PatientCreateEntityRepo,
  'createDate'
>
export type PatientUpdateEntityDomain = PatientUpdateEntityRepo

export type PathwayEnrollmentInput = {
  slotTemplateID: string
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
  findByID: (patientID: string) => Promise<PatientEntityDomain>
  create: (
    patientCreateParams: PatientCreateEntityDomain,
  ) => Promise<PatientEntityDomain>
  update: (
    patientID: string,
    patientUpdateParams: PatientUpdateEntityDomain,
  ) => Promise<PatientEntityDomain>
  delete: (patientID: string) => Promise<PatientEntityDomain>
  enrollPatientInPathways: (
    enrollmentData: EnrollPatientInPathwaysInput,
  ) => Promise<EnrollmentResult>
  enrollExistingPatientInPathways: (
    enrollmentData: EnrollExistingPatientInPathwaysInput,
  ) => Promise<EnrollmentResult>
}
