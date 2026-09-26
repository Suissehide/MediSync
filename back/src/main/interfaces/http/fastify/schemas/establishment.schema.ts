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
// réutilisé (Review Focus n°4, task-6-brief.md) : aucun champ ne distingue les deux cas, sans
// quoi cette route deviendrait un oracle disant quelles adresses ont déjà un compte.
export const createEstablishmentResponseSchema = z.object({
  establishment: z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.coerce.date(),
    deactivatedAt: z.coerce.date().nullable(),
  }),
  firstAdmin: z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
  }),
  // Le jeton en clair, rendu une seule fois — voir accessLink.domain.ts#issue. Ni journalisé ni
  // jamais recopié dans une URL (spec §6.1).
  accessLink: z.object({
    token: z.string(),
  }),
})

export type CreateEstablishmentBody = z.infer<typeof createEstablishmentSchema>
