import type { DiagnosticEducatifTemplate, Prisma } from '../../../generated/client'

export type DiagnosticEducatifTemplateEntity = DiagnosticEducatifTemplate

export type DiagnosticEducatifTemplateCreateEntity = Pick<
  Prisma.DiagnosticEducatifTemplateUncheckedCreateInput,
  'name' | 'activeFields'
>

export type DiagnosticEducatifTemplateUpdateEntity = Partial<DiagnosticEducatifTemplateCreateEntity>

export interface DiagnosticEducatifTemplateDomainInterface {
  findAll: () => Promise<DiagnosticEducatifTemplateEntity[]>
  findByID: (id: string) => Promise<DiagnosticEducatifTemplateEntity>
  create: (params: DiagnosticEducatifTemplateCreateEntity) => Promise<DiagnosticEducatifTemplateEntity>
  update: (id: string, params: DiagnosticEducatifTemplateUpdateEntity) => Promise<DiagnosticEducatifTemplateEntity>
  delete: (id: string) => Promise<DiagnosticEducatifTemplateEntity>
}
