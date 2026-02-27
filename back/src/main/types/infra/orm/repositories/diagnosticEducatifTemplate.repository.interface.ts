import type {
  DiagnosticEducatifTemplateCreateEntity,
  DiagnosticEducatifTemplateEntity,
  DiagnosticEducatifTemplateUpdateEntity,
} from '../../domain/diagnosticEducatifTemplate.domain.interface'

export interface DiagnosticEducatifTemplateRepositoryInterface {
  findAll: () => Promise<DiagnosticEducatifTemplateEntity[]>
  findByID: (id: string) => Promise<DiagnosticEducatifTemplateEntity>
  create: (params: DiagnosticEducatifTemplateCreateEntity) => Promise<DiagnosticEducatifTemplateEntity>
  update: (id: string, params: DiagnosticEducatifTemplateUpdateEntity) => Promise<DiagnosticEducatifTemplateEntity>
  delete: (id: string) => Promise<DiagnosticEducatifTemplateEntity>
}
