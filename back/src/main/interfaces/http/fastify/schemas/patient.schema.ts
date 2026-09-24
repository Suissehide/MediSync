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

  // Le parcours, le diagnostic medical et les notes ont demenage vers le
  // sous-dossier de service (etape 3 du multi-tenant) : voir
  // patientServiceFile.schema.ts, seul endroit du back ou ces seize champs
  // sont encore enumeres a la main.
}

export const patientSchema = z.object({
  ...patientEntity,
})

export const enrollmentIssueSchema = z.object({
  id: z.cuid(),
  pathwayName: z.string().optional().nullable(),
  pathwayTemplateID: z.string(),
  reason: z.string(),
  startDate: z.coerce.date(),
  createdAt: z.coerce.date(),
})

export const patientResponseSchema = z.object({
  id: z.cuid(),
  ...patientEntity,
  enrollmentIssues: z.array(enrollmentIssueSchema).optional(),
})

export const patientsResponseSchema = z.array(patientResponseSchema)

export const patientWithTagsResponseSchema = patientResponseSchema.extend({
  pathwayTemplateTags: z.array(z.string()),
})

export const patientsWithTagsResponseSchema = z.array(patientWithTagsResponseSchema)

export const getPatientByIdParamsSchema = z.object({
  patientID: z.cuid(),
})

// `.strict()` : les seize colonnes de parcours/clinique ont quitté ce schéma pour
// patientServiceFile.schema.ts (étape 3 du multi-tenant), mais Zod, sans `.strict()`, retire
// silencieusement les clés inconnues d'un corps de requête au lieu de les rejeter — un appelant
// qui envoie encore l'un des seize champs ici (le front actuel le fait, tâches 10/11) perdrait
// sa saisie sans aucune erreur. `.strict()` transforme cette perte silencieuse en 400 explicite,
// le temps que les appelants soient corrigés.
export const createPatientSchema = z.object(patientEntity).strict()

export const deletePatientByIdParamsSchema = getPatientByIdParamsSchema

export const updatePatientByIdSchema = {
  params: getPatientByIdParamsSchema,
  body: patientSchema.partial().strict(),
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

export const timeOfDaySchema = z.enum(['ALL_DAY', 'MORNING', 'AFTERNOON'])

export const pathwayEnrollmentSchema = z.object({
  tag: z.string().min(1),
  timeOfDay: timeOfDaySchema,
  thematicID: z.cuid().optional(),
  type: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['ambulatory', 'hospital', 'telephonic']).optional(),
  ),
  motif: z.string().optional(),
  duration: z.number().positive().optional(),
})

export const enrollPatientInPathwaysSchema = z.object({
  // `.strict()` : meme raison que sur createPatientSchema/updatePatientByIdSchema ci-dessus —
  // sans elle, un des seize champs de service envoye ici serait retire en silence par Zod, et
  // l'appelant croirait l'avoir enregistre (task-5-re-review.md, point 2).
  patientData: patientSchema.strict(),
  startDate: z.coerce.date(),
  pathways: z.array(pathwayEnrollmentSchema).min(1),
})

export const enrollExistingPatientInPathwaysSchema = z.object({
  patientID: z.cuid(),
  startDate: z.coerce.date(),
  pathways: z.array(pathwayEnrollmentSchema).optional().default([]),
})

export const enrollmentAppointmentSchema = z.object({
  id: z.cuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  success: z.boolean(),
  error: z.string().optional(),
})

export const slotTemplateRefSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
})

export const enrollmentResultItemSchema = z.object({
  slotTemplate: slotTemplateRefSchema,
  appointments: z.array(enrollmentAppointmentSchema),
})

export const failedEnrollmentSchema = z.object({
  slotTemplate: slotTemplateRefSchema,
  reason: z.string(),
})

export const enrollmentResultSchema = z.object({
  patient: patientResponseSchema,
  enrollments: z.array(enrollmentResultItemSchema),
  failedEnrollments: z.array(failedEnrollmentSchema),
})

export type TimeOfDay = z.infer<typeof timeOfDaySchema>
export type PathwayEnrollment = z.infer<typeof pathwayEnrollmentSchema>
export type EnrollPatientInPathwaysBody = z.infer<
  typeof enrollPatientInPathwaysSchema
>
export type EnrollExistingPatientInPathwaysBody = z.infer<
  typeof enrollExistingPatientInPathwaysSchema
>
export type EnrollmentResult = z.infer<typeof enrollmentResultSchema>

export const patientPathwayParamsSchema = z.object({
  patientID: z.cuid(),
  pathwayID: z.cuid(),
})
export type PatientPathwayParams = z.infer<typeof patientPathwayParamsSchema>

export const appointmentsCountResponseSchema = z.object({
  count: z.number(),
})

export const removeFromPathwayResponseSchema = z.object({
  deletedAppointments: z.number(),
  removedFromGroup: z.number(),
})

export const patientPathwayItemSchema = z.object({
  pathwayID: z.cuid(),
  templateID: z.string().nullable(),
  templateName: z.string().nullable(),
  templateColor: z.string().nullable(),
  templateMainTag: z.string().nullable(),
  startDate: z.coerce.date(),
  priority: z.number().int().nullable(),
})

export const patientPathwaysResponseSchema = z.array(patientPathwayItemSchema)

export const reorderPatientPathwaysBodySchema = z.object({
  pathwayIDs: z.array(z.cuid()),
})

export type PatientPathwayItem = z.infer<typeof patientPathwayItemSchema>
export type ReorderPatientPathwaysBody = z.infer<
  typeof reorderPatientPathwaysBodySchema
>
