import { z } from 'zod/v4'

import { cuid } from './id.schema'

// Colonnes fixes du sous-dossier ; les champs configurables vivent dans `data` et `clinicalData`.
const patientServiceFileEntity = {
  // Referrals & Context
  referringCaregiver: z.string().optional().nullable(), // Soignant référent
  followUpToDo: z.string().optional().nullable(), // Suivi à régulariser

  // Notes
  notes: z.string().optional().nullable(),
  details: z.string().optional().nullable(),

  entryDate: z.coerce.date().optional().nullable(),
  exitDate: z.coerce.date().optional().nullable(),
}

// Le signal de suivi ailleurs (spec §5.3/§6) vivait ici : indisponible tant qu'aucun sous-dossier
// local n'existe encore, c'est-a-dire exactement au moment ou la decision 2.1 le rend le plus
// utile (un second service qui accueille un patient deja suivi ailleurs part d'un sous-dossier
// vide, donc d'un 404). Il vit desormais sur la lecture du patient (`patient.schema.ts`,
// `patientDetailResponseSchema`), disponible avant qu'aucun sous-dossier de service n'existe —
// voir domain/patient.domain.ts, `findByID`.
export const patientServiceFileResponseSchema = z.object({
  id: cuid(),
  patientId: z.string(),
  serviceId: z.string(),
  establishmentId: z.string(),
  createdAt: z.coerce.date(),
  ...patientServiceFileEntity,
  data: z.record(z.string(), z.unknown()),
  // Optionnel : le crochet clinique le retire pour qui n'a pas `clinical:read`.
  clinicalData: z.record(z.string(), z.unknown()).optional(),
})

export const patientServiceFileParamsSchema = z.object({
  patientID: cuid(),
})

export const upsertPatientServiceFileBodySchema = z.object({
  ...patientServiceFileEntity,
  data: z.record(z.string(), z.unknown()).optional(),
  clinicalData: z.record(z.string(), z.unknown()).optional(),
})

// Rattachement d'une identite existante au service courant (design §6) : cree le
// sous-dossier s'il n'existe pas encore, sans toucher a une seule de ses colonnes s'il existe
// deja — `alreadyFollowedHere` le dit explicitement, pour que l'ecran distingue les deux cas
// sans avoir a comparer un etat avant/apres lui-meme. Volontairement
// minimal : ni le contenu du sous-dossier (cree vide, ou deja existant et donc potentiellement
// clinique) ni l'identite du patient n'ont a transiter dans cette reponse pour que l'ecran sache
// quoi faire.
export const attachPatientToCurrentServiceResponseSchema = z.object({
  patientId: cuid(),
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
