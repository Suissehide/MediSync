import type { DiagnosticEducatif, Prisma } from '../../../generated/client'

export type DiagnosticEducatifEntity = DiagnosticEducatif

// Le repository pose serviceId/establishmentId lui-même : l'appelant ne les fournit pas.
export type DiagnosticEducatifCreateEntity = Omit<
  Prisma.DiagnosticEducatifUncheckedCreateInput,
  'patient' | 'template' | 'serviceId' | 'establishmentId'
> & {
  templateId?: string
}

export type DiagnosticEducatifUpdateEntity = Partial<
  Omit<
    Prisma.DiagnosticEducatifUncheckedUpdateInput,
    'patient' | 'template' | 'serviceId' | 'establishmentId'
  >
>

export interface DiagnosticEducatifDomainInterface {
  findByPatientID: (patientId: string) => Promise<DiagnosticEducatifEntity[]>
  findByID: (id: string) => Promise<DiagnosticEducatifEntity>
  create: (
    params: DiagnosticEducatifCreateEntity,
    userID: string,
  ) => Promise<DiagnosticEducatifEntity>
  update: (
    id: string,
    params: DiagnosticEducatifUpdateEntity,
    userID: string,
  ) => Promise<DiagnosticEducatifEntity>
  delete: (id: string) => Promise<DiagnosticEducatifEntity>
}
