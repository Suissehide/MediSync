import type { ActivityLog } from './activityLog.ts'
import type { EstablishmentRole } from './auth.ts'

// Miroir des schémas Zod du back (tâche 12, brief) :
// `back/src/main/interfaces/http/fastify/schemas/establishment.schema.ts`,
// `superAdminUser.schema.ts`, `superAdminGrant.schema.ts` — lus plutôt que
// devinés. `src/types` n'est couvert par aucune convention de tenant
// implicite (`src/test/conventions-tenant-api-queries.test.ts` ne balaie
// que `src/api` et `src/queries`) : les champs ci-dessous nomment
// `establishmentId` librement, ils désignent une DONNÉE reçue par ces
// routes, jamais un tenant implicite — le super-admin est hors de tout
// tenant.

export type SuperAdminFirstAdmin = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
}

// `establishmentListItemSchema` (spec §3.3) : clés exactes, une par colonne
// de la liste (étape 1 de la tâche).
export type EstablishmentListItem = {
  id: string
  name: string
  createdAt: string
  deactivatedAt: string | null
  serviceCount: number
  accountCount: number
  patientCount: number
  firstAdmin: SuperAdminFirstAdmin | null
  lastActivityAt: string | null
}

export type EstablishmentDetailService = {
  id: string
  name: string
  createdAt: string
  deactivatedAt: string | null
}

export type EstablishmentDetailMember = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: EstablishmentRole
  createdAt: string
  deactivatedAt: string | null
}

// `establishmentDetailResponseSchema` : la ligne de liste ci-dessus,
// augmentée des services et des membres — désactivés compris dans les deux
// listes (tour de correction 2, arbitrage de Léo), à la différence des
// compteurs agrégés hérités de `EstablishmentListItem`.
//
// `activityLog` A ÉTÉ RETIRÉ D'ICI le 2026-10-01, avec la borne de 100 lignes
// qui le coiffait : le journal a sa propre route paginée (`GET
// /super-admin/establishments/:id/activity-log`, type ci-dessous). Le garder
// ici EN PLUS donnerait deux sources à une seule table à l'écran, et une
// première page chargée deux fois à chaque montage. `lastActivityAt` reste,
// hérité d'`EstablishmentListItem`.
export type EstablishmentDetail = EstablishmentListItem & {
  services: EstablishmentDetailService[]
  members: EstablishmentDetailMember[]
}

// Miroir d'`establishmentActivityLogResponseSchema` (back) : mêmes quatre clés
// que les deux autres journaux. La LIGNE, elle, est inchangée — `ActivityLog`
// sans `serviceId` (ce champ n'est rendu que par le journal d'administration
// d'établissement, voir `types/activityLog.ts`).
export type EstablishmentActivityLogResponse = {
  data: ActivityLog[]
  total: number
  page: number
  pageSize: number
}

// `CreateEstablishmentInput`/`CreateEstablishmentResult` (POST
// /super-admin/establishments, `createEstablishmentSchema`/
// `createEstablishmentResponseSchema` côté back) avaient été retirés ici
// (tour de correction 1, Important n°5) faute d'écran, de requête ou de
// test — réintroduits à la tâche 14b (hors plan, étape 4a), avec les trois
// à la fois : voir `createEstablishmentForm.tsx` et son test, qui gardent
// le jeton (`accessLink.token`) sur les mêmes cinq canaux qu'à la tâche 13
// (`createMemberAccountForm.tsx`).
export type CreateEstablishmentInput = {
  name: string
  email: string
  firstName?: string
  lastName?: string
}

export type CreateEstablishmentResult = {
  establishment: {
    id: string
    name: string
    createdAt: string
    deactivatedAt: string | null
  }
  accessLink: { token: string }
}

export type AccountMembership = {
  establishmentId: string
  establishmentName: string
  role: EstablishmentRole
  createdAt: string
}

// `accountSearchResponseSchema` : répond à « untel ne voit plus ses
// patients » — rattachements, rôles, désactivations, dernier accès. Aucun
// champ de patient (vérifié en lisant le schéma back).
export type AccountSearchResult = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  deactivatedAt: string | null
  lastLoginAt: string | null
  memberships: AccountMembership[]
}

export type ReissueAccessLinkResult = {
  accessLink: { token: string }
}

export type CreateGrantInput = {
  establishmentId: string
  reason: string
  durationHours?: number
}

export type SuperAdminGrant = {
  id: string
  establishmentId: string
  reason: string
  grantedAt: string
  expiresAt: string
  revokedAt: string | null
}
