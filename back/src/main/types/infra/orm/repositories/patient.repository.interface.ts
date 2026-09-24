import type {
  Patient,
  Prisma,
} from '../../../../../generated/client'
import type { PatientWithAppointmentsDomain } from '../../../domain/patient.domain.interface'
import type { EnrollmentIssueEntityRepo } from './enrollmentIssue.repository.interface'
import type { PatientServiceFileEntityRepo } from './patientServiceFile.repository.interface'

export type PatientEntityRepo = Patient
export type PatientWithTagsEntityRepo = Patient & {
  pathwayTemplateTags: string[]
  enrollmentIssues: EnrollmentIssueEntityRepo[]
}
// Utilise par l'export Excel : le parcours et le contenu clinique vivent desormais sur le
// sous-dossier de service (etape 3 du multi-tenant), `null` quand le patient n'en a pas encore
// dans le service courant.
export type PatientForExportEntityRepo = PatientWithTagsEntityRepo & {
  serviceFile: PatientServiceFileEntityRepo | null
}
// Le repository pose establishmentId lui-même : l'appelant ne le fournit pas.
export type PatientCreateEntityRepo = Omit<Prisma.PatientUncheckedCreateInput, 'establishmentId'>
export type PatientUpdateEntityRepo = Omit<Prisma.PatientUncheckedUpdateInput, 'establishmentId'>

export type PatientExportFilters = {
  search?: string
  pathwayTemplateTags?: string[]
}

export type PatientPathwayEntityRepo = {
  pathwayID: string
  templateID: string | null
  templateName: string | null
  templateColor: string | null
  templateMainTag: string | null
  startDate: Date
  priority: number | null
}

export interface PatientRepositoryInterface {
  findAll: () => Promise<PatientEntityRepo[]>
  findAllWithTags: () => Promise<PatientWithTagsEntityRepo[]>
  findForExport: (filters: PatientExportFilters) => Promise<PatientForExportEntityRepo[]>
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
