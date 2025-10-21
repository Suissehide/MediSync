import { z } from 'zod/v4'

const patientEntity = {
  firstName: z.string(),
  lastName: z.string(),
  gender: z.string().optional().nullable(),
  birthDate: z.coerce.date().optional().nullable(),

  // Contact
  phone1: z.string().optional().nullable(),
  phone2: z.string().optional().nullable(),
  email: z.string().optional().nullable(),

  // Personal & Social Info
  distance: z.string().optional().nullable(), // Distance d'habitation
  educationLevel: z.string().optional().nullable(), // Niveau d’étude
  occupation: z.string().optional().nullable(), // Profession
  currentActivity: z.string().optional().nullable(), // Activité actuelle

  // Referrals & Context
  referringCaregiver: z.string().optional().nullable(), // Soignant référent
  followUpToDo: z.boolean().optional().nullable(), // Suivi à régulariser

  // Notes
  notes: z.string().optional().nullable(),
  details: z.string().optional().nullable(),

  // Inclusion Data
  medicalDiagnosis: z.string().optional().nullable(),
  entryDate: z.coerce.date().optional().nullable(),
  careMode: z.string().optional().nullable(), // Mode de prise en charge
  orientation: z.string().optional().nullable(),
  etpDecision: z.string().optional().nullable(), // ETP décision
  programType: z.string().optional().nullable(),
  nonInclusionDetails: z.string().optional().nullable(),
  customContentDetails: z.string().optional().nullable(),
  goal: z.string().optional().nullable(),

  // Exit Data
  exitDate: z.coerce.date().optional().nullable(),
  stopReason: z.string().optional().nullable(), // Motif d’arrêt de programme
  etpFinalOutcome: z.string().optional().nullable(), // Point final parcours ETP
}

export const patientSchema = z.object({
  ...patientEntity,
})

export const patientResponseSchema = z.object({
  id: z.cuid(),
  ...patientEntity,
})

export const patientsResponseSchema = z.array(patientResponseSchema)

export const getPatientByIdParamsSchema = z.object({
  patientID: z.cuid(),
})

export const createPatientSchema = z.object(patientEntity).omit({})

export const deletePatientByIdParamsSchema = getPatientByIdParamsSchema

export const updatePatientByIdSchema = {
  params: getPatientByIdParamsSchema,
  body: patientSchema.partial(),
}

export type PatientInput = z.infer<typeof patientSchema>
export type GetPatientByIdParams = z.infer<typeof getPatientByIdParamsSchema>
export type CreatePatientBody = z.infer<typeof createPatientSchema>
export type UpdatePatientParams = z.infer<typeof updatePatientByIdSchema.params>
export type UpdatePatientBody = z.infer<typeof updatePatientByIdSchema.body>
export type DeletePatientByIdParams = z.infer<
  typeof deletePatientByIdParamsSchema
>
export type PatientResponse = z.infer<typeof patientResponseSchema>
