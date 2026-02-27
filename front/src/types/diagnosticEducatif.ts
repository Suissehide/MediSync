export type DiagnosticEducatifTemplate = {
  id: string
  name: string
  activeFields: string[]
}

export type DiagnosticEducatif = {
  id: string
  createdAt: string
  title: string | null
  activeFields: string[]
  patientId: string
  templateId: string | null
  [key: string]: unknown
}

export type CreateDiagnosticEducatifParams = {
  title?: string
  activeFields?: string[]
  templateId?: string
  patientId: string
  [key: string]: unknown
}

export type UpdateDiagnosticEducatifParams = {
  id: string
  patientId: string
  activeFields?: string[]
  [key: string]: unknown
}

export type CreateDiagnosticEducatifTemplateParams = {
  name: string
  activeFields: string[]
}

export type UpdateDiagnosticEducatifTemplateParams = {
  id: string
  name?: string
  activeFields?: string[]
}
