import type {
  Patient,
  Prisma,
} from '../../../../../generated/client'
import type { PatientWithAppointmentsDomain } from '../../../domain/patient.domain.interface'
import type { EnrollmentIssueEntityRepo } from './enrollmentIssue.repository.interface'

export type PatientEntityRepo = Patient
export type PatientWithTagsEntityRepo = Patient & {
  pathwayTemplateTags: string[]
  enrollmentIssues: EnrollmentIssueEntityRepo[]
}
export type PatientCreateEntityRepo = Prisma.PatientUncheckedCreateInput
export type PatientUpdateEntityRepo = Prisma.PatientUncheckedUpdateInput

export type PatientExportFilters = {
  search?: string
  pathwayTemplateTags?: string[]
}

export type PatientPathwayEntityRepo = {
  pathwayID: string
  templateID: string | null
  templateName: string | null
  templateColor: string | null
  templateTags: string[]
  startDate: Date
  priority: number | null
}

export interface PatientRepositoryInterface {
  findAll: () => Promise<PatientEntityRepo[]>
  findAllWithTags: () => Promise<PatientWithTagsEntityRepo[]>
  findForExport: (filters: PatientExportFilters) => Promise<PatientWithTagsEntityRepo[]>
  findByID: (id: string) => Promise<PatientWithAppointmentsDomain>
  create: (
    patientCreateParams: PatientCreateEntityRepo,
  ) => Promise<PatientEntityRepo>
  update: (
    patientID: string,
    patientUpdateParams: PatientUpdateEntityRepo,
  ) => Promise<PatientEntityRepo>
  delete: (patientID: string) => Promise<PatientEntityRepo>
  removeFromPathway: (
    patientID: string,
    pathwayID: string,
  ) => Promise<{ deletedAppointments: number; removedFromGroup: number }>
  countAppointmentsInPathway: (
    patientID: string,
    pathwayID: string,
  ) => Promise<number>
  getPathwaysForPatient: (patientID: string) => Promise<PatientPathwayEntityRepo[]>
  setPathwayPriorities: (
    patientID: string,
    orderedPathwayIDs: string[],
  ) => Promise<void>
}
