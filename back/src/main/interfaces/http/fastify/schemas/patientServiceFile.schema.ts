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

// Le signal de suivi ailleurs (spec §5.3/§6, tache 7) vivait ici jusqu'au tour de correction 1 de
// la revue de cette tache (I1) : indisponible tant qu'aucun sous-dossier local n'existe encore,
// c'est-a-dire exactement au moment ou la decision 2.1 le rend le plus utile (un second service
// qui accueille un patient deja suivi ailleurs part d'un sous-dossier vide, donc d'un 404). Il
// vit desormais sur la lecture du patient (`patient.schema.ts`, `patientDetailResponseSchema`),
// disponible avant qu'aucun sous-dossier de service n'existe — voir domain/patient.domain.ts,
// `findByID`.
export const patientServiceFileResponseSchema = z.object({
  id: z.cuid(),
  patientId: z.string(),
  serviceId: z.string(),
  establishmentId: z.string(),
  createdAt: z.coerce.date(),
  ...patientServiceFileEntity,
})

export const patientServiceFileParamsSchema = z.object({
  patientID: z.cuid(),
})

export const upsertPatientServiceFileBodySchema = z.object(
  patientServiceFileEntity,
)

// Rattachement d'une identite existante au service courant (design §6, tache 13) : cree le
// sous-dossier s'il n'existe pas encore, sans toucher a une seule de ses colonnes s'il existe
// deja — `alreadyFollowedHere` le dit explicitement, pour que l'ecran distingue les deux cas
// (consigne 4 du brief) sans avoir a comparer un etat avant/apres lui-meme. Volontairement
// minimal : ni le contenu du sous-dossier (cree vide, ou deja existant et donc potentiellement
// clinique) ni l'identite du patient n'ont a transiter dans cette reponse pour que l'ecran sache
// quoi faire.
export const attachPatientToCurrentServiceResponseSchema = z.object({
  patientId: z.cuid(),
  alreadyFollowedHere: z.boolean(),
})

export type PatientServiceFileResponse = z.infer<
  typeof patientServiceFileResponseSchema
>
export type PatientServiceFileParams = z.infer<
  typeof patientServiceFileParamsSchema
>
export type UpsertPatientServiceFileBody = z.infer<
  typeof upsertPatientServiceFileBodySchema
>
export type AttachPatientToCurrentServiceResponse = z.infer<
  typeof attachPatientToCurrentServiceResponseSchema
>
