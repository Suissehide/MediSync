import type {
  DiagnosticEducatifCreateEntity,
  DiagnosticEducatifEntity,
  DiagnosticEducatifUpdateEntity,
} from '../../../domain/diagnosticEducatif.domain.interface'

export interface DiagnosticEducatifRepositoryInterface {
  findByPatientID: (patientId: string) => Promise<DiagnosticEducatifEntity[]>
  findByID: (id: string) => Promise<DiagnosticEducatifEntity>
  create: (params: DiagnosticEducatifCreateEntity) => Promise<DiagnosticEducatifEntity>
  update: (id: string, params: DiagnosticEducatifUpdateEntity) => Promise<DiagnosticEducatifEntity>
  delete: (id: string) => Promise<DiagnosticEducatifEntity>
}
