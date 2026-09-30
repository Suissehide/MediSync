import { z } from 'zod/v4'

import { activityLogResponseSchema } from './activityLog.schema'

const establishmentRoleSchema = z.enum(['ADMIN', 'MEMBER'])

// `POST /super-admin/establishments` (spec §6.2). Le nom du premier
// administrateur est optionnel : un compte déjà existant garde le sien, un
// compte neuf peut rester sans prénom/nom jusqu'à ce qu'il complète son profil (`/me`).
export const createEstablishmentSchema = z.object({
  name: z.string().trim().min(1, 'Establishment name is required'),
  email: z.email({
    error: (issue) =>
      issue.input === undefined ? 'Email is required' : 'Email is not valid',
  }),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
})

// Volontairement la MÊME forme, que le compte du premier administrateur ait été créé ou
// réutilisé : AUCUNE information sur le compte au-delà de
// ce qui est nécessaire — l'établissement créé et le lien, rien d'autre. Cette réponse portait
// autrefois `firstAdmin.{firstName,lastName}`, qui reflétaient la valeur STOCKÉE plutôt que celle
// SOUMISE dans la requête — un appel avec un nom différent sur une adresse déjà connue rendait
// l'ancien nom. La divergence entre soumis et reçu EST un oracle d'existence de comptes, même
// quand le statut et les clés sont identiques :
// voir le commentaire détaillé sur `CreateEstablishmentResult`
// (types/domain/establishment.domain.interface.ts).
export const createEstablishmentResponseSchema = z.object({
  establishment: z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.coerce.date(),
    deactivatedAt: z.coerce.date().nullable(),
  }),
  // Le jeton en clair, rendu une seule fois — voir accessLink.domain.ts#issue. Ni journalisé ni
  // jamais recopié dans une URL (spec §6.1).
  accessLink: z.object({
    token: z.string(),
  }),
})

export type CreateEstablishmentBody = z.infer<typeof createEstablishmentSchema>

// `GET /super-admin/establishments` et `GET /super-admin/establishments/:id` (spec §3.3, §6.2).
// Clés EXACTES — un test les affirme triées, pas seulement l'absence de quelques
// champs. `patientCount` est une donnée de santé agrégée, assumée et
// bornée : un nombre, jamais une identité ni un contenu (spec §3.3).
//
// `lastActivityAt`, PAS `lastAccessAt` : voir le
// commentaire détaillé sur `EstablishmentCounters`
// (types/infra/orm/repositories/establishment.repository.interface.ts) — la dernière ligne de
// journal DE CET établissement, jamais une connexion à un autre. Sous-déclare l'activité réelle
// (le journal ne porte que des écritures) et régresse à `null` après la purge à douze mois — voir
// le même commentaire.
//
// `serviceCount`/`accountCount` ne comptent QUE l'utilisable (même commentaire) — désactivés
// exclus, comme `firstAdmin`.
export const establishmentListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.coerce.date(),
  deactivatedAt: z.coerce.date().nullable(),
  serviceCount: z.number(),
  accountCount: z.number(),
  patientCount: z.number(),
  // Nul quand l'établissement n'a aucun administrateur ENCORE actif (le premier a pu être
  // désactivé). Nom visible : un nom de collègue n'est
  // pas une donnée de santé, à la différence d'un nom de patient — voir le commentaire sur
  // `FirstAdmin` (establishment.repository.interface.ts).
  firstAdmin: z
    .object({
      id: z.string(),
      email: z.string(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
    })
    .nullable(),
  lastActivityAt: z.coerce.date().nullable(),
})
export const establishmentListResponseSchema = z.array(
  establishmentListItemSchema,
)

export const renameEstablishmentSchema = z.object({
  name: z.string().trim().min(1, 'Establishment name is required'),
})
export type RenameEstablishmentBody = z.infer<typeof renameEstablishmentSchema>

export const renameEstablishmentResponseSchema =
  createEstablishmentResponseSchema.shape.establishment

export const establishmentIdParamsSchema = z.object({ id: z.string() })
export type EstablishmentIdParams = z.infer<typeof establishmentIdParamsSchema>

// Le détail d'un établissement (spec §6.2) : la ligne ci-dessus, augmentée
// des services, des membres et du journal d'activité. Désactivés TOUJOURS compris dans ces deux
// listes (à la différence des compteurs ci-dessus, qui
// eux ne comptent que l'utilisable) — un établissement affichant « 1 service » au-dessus d'une
// liste de deux n'est pas une incohérence, c'est voulu : on voit qu'un service désactivé existe
// encore, ne serait-ce que pour le réactiver, et le compteur reste lisible dès que la liste le
// montre à côté.
const establishmentDetailServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.coerce.date(),
  deactivatedAt: z.coerce.date().nullable(),
})

// Nom visible — même principe que `firstAdmin`
// ci-dessus.
const establishmentDetailMemberSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  role: establishmentRoleSchema,
  createdAt: z.coerce.date(),
  deactivatedAt: z.coerce.date().nullable(),
})

export const establishmentDetailResponseSchema =
  establishmentListItemSchema.extend({
    services: z.array(establishmentDetailServiceSchema),
    members: z.array(establishmentDetailMemberSchema),
    activityLog: z.array(activityLogResponseSchema),
  })
