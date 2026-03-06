import type { DiagnosticEducatif, Prisma } from '../../../generated/client'

export type DiagnosticEducatifEntity = DiagnosticEducatif

export type DiagnosticEducatifCreateEntity = Omit<
  Prisma.DiagnosticEducatifUncheckedCreateInput,
  'patient' | 'template'
> & {
  templateId?: string
}

export type DiagnosticEducatifUpdateEntity = Partial<
  Omit<Prisma.DiagnosticEducatifUncheckedUpdateInput, 'patient' | 'template'>
>

export interface DiagnosticEducatifDomainInterface {
  findByPatientID: (patientId: string) => Promise<DiagnosticEducatifEntity[]>
  findByID: (id: string) => Promise<DiagnosticEducatifEntity>
  create: (params: DiagnosticEducatifCreateEntity, userID: string) => Promise<DiagnosticEducatifEntity>
  update: (id: string, params: DiagnosticEducatifUpdateEntity, userID: string) => Promise<DiagnosticEducatifEntity>
  delete: (id: string) => Promise<DiagnosticEducatifEntity>
}
