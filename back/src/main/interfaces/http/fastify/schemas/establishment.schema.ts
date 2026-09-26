import { z } from 'zod/v4'

// `POST /super-admin/establishments` (spec §6.2, étape 4a tâche 6). Le nom du premier
// administrateur est optionnel : un compte déjà existant (Review Focus n°4) garde le sien, un
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
// réutilisé (Review Focus n°4, task-6-brief.md) : AUCUNE information sur le compte au-delà de
// ce qui est nécessaire — l'établissement créé et le lien, rien d'autre. Tour de correction 1
// (relecture externe), Important n°1 : cette réponse portait `firstAdmin.{firstName,lastName}`,
// qui reflétaient la valeur STOCKÉE plutôt que celle SOUMISE dans la requête — un appel avec un
// nom différent sur une adresse déjà connue rendait l'ancien nom. La divergence entre soumis et
// reçu EST un oracle d'existence de comptes, même quand le statut et les clés sont identiques :
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
