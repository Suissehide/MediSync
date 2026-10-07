import type {
  DiagnosticEducatifTemplateCreateEntity,
  DiagnosticEducatifTemplateEntity,
  DiagnosticEducatifTemplateUpdateEntity,
} from '../../../domain/diagnosticEducatifTemplate.domain.interface'

export interface DiagnosticEducatifTemplateRepositoryInterface {
  findAll: (archived?: boolean) => Promise<DiagnosticEducatifTemplateEntity[]>
  findByID: (id: string) => Promise<DiagnosticEducatifTemplateEntity>
  create: (
    params: DiagnosticEducatifTemplateCreateEntity,
  ) => Promise<DiagnosticEducatifTemplateEntity>
  update: (
    id: string,
    params: DiagnosticEducatifTemplateUpdateEntity,
  ) => Promise<DiagnosticEducatifTemplateEntity>
  // Suppression definitive : refusee si la ligne n'est pas archivee,
  // ou si quoi que ce soit la reference encore.
  deleteForever: (id: string) => Promise<void>
}
