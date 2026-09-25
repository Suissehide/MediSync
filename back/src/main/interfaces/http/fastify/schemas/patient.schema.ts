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

// Signal de suivi ailleurs (spec §5.3/§6, tache 7 — deplace ici au tour de correction 1 de la
// revue, I1) : vrai si ce patient a au moins un sous-dossier dans un AUTRE service du meme
// etablissement. Calcule, jamais stocke ; absent de `patientEntity` (partagee avec les corps
// d'ecriture) pour qu'aucune ecriture ne puisse le poser. Champ administratif, pas clinique : ni
// `stripClinicalFields` ni `stripClinicalInput` (utils/clinical-fields.ts) ne le nomment, il est
// donc visible du secretariat comme les autres champs administratifs du patient — decision 2.2.
//
// Pose UNIQUEMENT sur `GET /patient/:patientID` (le detail d'un patient, "le bloc d'identite"
// de la spec §6), pas sur `patientResponseSchema` en general : celui-ci est aussi le squelette
// de `patientsResponseSchema` (liste) et de `patientWithTagsResponseSchema` (liste avec tags).
// Le calculer pour CHAQUE ligne d'une liste couterait une requete `runAsSystem` supplementaire
// par patient affiche (le meme cout que m3 de la revue de la tache 7 relevait deja sur le PATCH
// du sous-dossier, mais multiplie par la taille de la liste au lieu d'une seule fois) — pour un
// signal que la spec §6 place dans le bloc d'identite d'un patient OUVERT, jamais dans une
// liste. Ce choix n'est pas cense etre definitif : s'il s'avere qu'une liste a besoin du signal,
// il faudra soit l'y calculer explicitement (avec son cout assume), soit le derouler autrement
// (jointure unique plutot qu'un appel par ligne).
export const patientDetailResponseSchema = patientResponseSchema.extend({
  followedElsewhere: z.boolean(),
})

export const patientWithTagsResponseSchema = patientResponseSchema.extend({
  pathwayTemplateTags: z.array(z.string()),
  // Date d'entree dans le service courant : jointe depuis le sous-dossier de service filtre
  // sur ce service (`findAllWithTags`, back), pas depuis `patientEntity` — `null` si le
  // patient n'a pas encore de sous-dossier dans ce service. Tache 12 du plan.
  entryDate: z.coerce.date().optional().nullable(),
})

export const patientsWithTagsResponseSchema = z.array(patientWithTagsResponseSchema)

// Recherche d'identite existante avant creation (design §6, tache 13) : au moins un prenom ou un
// nom est exige, pour eviter qu'un appel sans filtre ne rende tout l'etablissement — la date de
// naissance seule ne suffit pas non plus a la declencher. `.refine` plutot que deux champs
// obligatoires : chacun des trois filtres reste facultatif pris seul.
export const searchPatientIdentityQuerySchema = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    birthDate: z.coerce.date().optional(),
  })
  .refine((query) => !!query.firstName || !!query.lastName, {
    message: 'Un prénom ou un nom est requis pour rechercher une identité existante',
  })

// Ce que la recherche a le droit de rendre, et rien d'autre (design §5.3/§6) : jamais le suivi,
// jamais un service, jamais un contenu de dossier, jamais un compte. `id` est necessaire pour
// choisir l'identite (rattachement au service courant), il n'ajoute aucune information nouvelle
// puisque l'appelant le reçoit pour un patient qu'il vient de trouver par son nom.
export const patientIdentityMatchSchema = z.object({
  id: z.cuid(),
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.coerce.date().nullable(),
})

export const patientIdentitySearchResponseSchema = z.array(patientIdentityMatchSchema)

export type SearchPatientIdentityQuery = z.infer<typeof searchPatientIdentityQuerySchema>

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
export type PatientDetailResponse = z.infer<typeof patientDetailResponseSchema>

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
