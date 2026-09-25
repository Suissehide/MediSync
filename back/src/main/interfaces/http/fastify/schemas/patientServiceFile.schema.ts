import { z } from 'zod/v4'

// Les seize champs deplaces hors de `patient.schema.ts` (etape 3 du multi-tenant), a
// l'identique : memes types, memes contraintes. C'est desormais le seul endroit du back ou ils
// sont enumeres a la main.
const patientServiceFileEntity = {
  // Referrals & Context
  referringCaregiver: z.string().optional().nullable(), // Soignant référent
  followUpToDo: z.string().optional().nullable(), // Suivi à régulariser

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

export const patientServiceFileResponseSchema = z.object({
  id: z.cuid(),
  patientId: z.string(),
  serviceId: z.string(),
  establishmentId: z.string(),
  createdAt: z.coerce.date(),
  ...patientServiceFileEntity,
  // Signal de suivi ailleurs (spec §5.3, tache 7) : vrai si ce patient a un sous-dossier dans un
  // autre service du meme etablissement. Calcule, jamais stocke — absent de
  // `patientServiceFileEntity` (partagee avec le corps d'ecriture) pour qu'aucune ecriture ne
  // puisse le poser. Champ administratif, pas clinique : ni `stripClinicalFields` ni
  // `stripClinicalInput` (utils/clinical-fields.ts) ne le nomment, il est donc visible du
  // secretariat comme les autres champs administratifs du sous-dossier.
  followedElsewhere: z.boolean(),
})

export const patientServiceFileParamsSchema = z.object({
  patientID: z.cuid(),
})

export const upsertPatientServiceFileBodySchema = z.object(patientServiceFileEntity)

export type PatientServiceFileResponse = z.infer<typeof patientServiceFileResponseSchema>
export type PatientServiceFileParams = z.infer<typeof patientServiceFileParamsSchema>
export type UpsertPatientServiceFileBody = z.infer<typeof upsertPatientServiceFileBodySchema>
