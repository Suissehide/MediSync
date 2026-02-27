import { z } from 'zod/v4'
import { diagnosticEducatifSchema, diagnosticEducatifTemplateSchema } from './index'

// Template schemas
export const diagnosticEducatifTemplateResponseSchema = diagnosticEducatifTemplateSchema.extend({ id: z.cuid() })
export const diagnosticEducatifTemplatesResponseSchema = z.array(diagnosticEducatifTemplateResponseSchema)
export const createDiagnosticEducatifTemplateSchema = diagnosticEducatifTemplateSchema
export const updateDiagnosticEducatifTemplateSchema = {
  params: z.object({ templateId: z.cuid() }),
  body: diagnosticEducatifTemplateSchema.partial(),
}
export const diagnosticTemplateParamsSchema = z.object({ templateId: z.cuid() })

export type DiagnosticEducatifTemplateResponse = z.infer<typeof diagnosticEducatifTemplateResponseSchema>
export type CreateDiagnosticEducatifTemplateBody = z.infer<typeof createDiagnosticEducatifTemplateSchema>
export type UpdateDiagnosticEducatifTemplateBody = z.infer<typeof updateDiagnosticEducatifTemplateSchema.body>
export type UpdateDiagnosticEducatifTemplateParams = z.infer<typeof updateDiagnosticEducatifTemplateSchema.params>
export type DiagnosticTemplateParams = z.infer<typeof diagnosticTemplateParamsSchema>

// Diagnostic schemas
export const diagnosticEducatifResponseSchema = diagnosticEducatifSchema.extend({ id: z.cuid(), createdAt: z.coerce.date() })
export const diagnosticEducatifsResponseSchema = z.array(diagnosticEducatifResponseSchema)
export const createDiagnosticEducatifSchema = diagnosticEducatifSchema.omit({ patientId: true })
export const updateDiagnosticEducatifSchema = {
  params: z.object({ patientId: z.cuid(), diagnosticId: z.cuid() }),
  body: diagnosticEducatifSchema.omit({ patientId: true }).partial(),
}
export const diagnosticParamsSchema = z.object({ patientId: z.cuid(), diagnosticId: z.cuid() })
export const diagnosticPatientParamsSchema = z.object({ patientId: z.cuid() })

export type DiagnosticEducatifResponse = z.infer<typeof diagnosticEducatifResponseSchema>
export type CreateDiagnosticEducatifBody = z.infer<typeof createDiagnosticEducatifSchema>
export type UpdateDiagnosticEducatifBody = z.infer<typeof updateDiagnosticEducatifSchema.body>
export type UpdateDiagnosticEducatifParams = z.infer<typeof updateDiagnosticEducatifSchema.params>
export type DiagnosticParams = z.infer<typeof diagnosticParamsSchema>
export type DiagnosticPatientParams = z.infer<typeof diagnosticPatientParamsSchema>
