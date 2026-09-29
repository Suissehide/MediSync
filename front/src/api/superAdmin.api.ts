import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  AccountSearchResult,
  CreateEstablishmentInput,
  CreateEstablishmentResult,
  CreateGrantInput,
  EstablishmentDetail,
  EstablishmentListItem,
  ReissueAccessLinkResult,
  SuperAdminGrant,
} from '../types/superAdmin.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// Le super-admin est hors de tout tenant (front/CLAUDE.md, § « Le contexte
// est implicite ») : ces routes ne vivent ni sous un établissement ni sous
// un service, donc ni `tenantApiUrl()` ni `establishmentApiUrl()` (qui
// exigent un contexte posé par un layout de tenant, et lèveraient ici) ne
// s'appliquent — un préfixe fixe, comme n'importe quelle autre route hors
// tenant (`/me`, `/auth`).
const SUPER_ADMIN_URL = () => `${apiUrl}/super-admin`

export const SuperAdminApi = {
  listEstablishments: async (): Promise<EstablishmentListItem[]> => {
    const response = await fetchWithAuth(
      `${SUPER_ADMIN_URL()}/establishments`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer les établissements',
      )
    }
    return response.json()
  },

  // L'identifiant reçu ici est une DONNÉE du chemin (`GET
  // /super-admin/establishments/:id`), pas un tenant implicite — voir
  // l'exception déclarée dans conventions-tenant-api-queries.test.ts et le
  // commentaire de tête de ce fichier.
  getEstablishment: async (
    establishmentId: string,
  ): Promise<EstablishmentDetail> => {
    const response = await fetchWithAuth(
      `${SUPER_ADMIN_URL()}/establishments/${establishmentId}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible de récupérer l'établissement")
    }
    return response.json()
  },

  // Réintroduit à la tâche 14b (hors plan, étape 4a) : « aucun écran ne
  // l'appelait » n'est plus vrai, voir `createEstablishmentForm.tsx`, qui
  // porte la garde manquante (le jeton `accessLink.token` ne quitte jamais
  // l'écran — cinq canaux, comme `createMemberAccount`).
  createEstablishment: async (
    input: CreateEstablishmentInput,
  ): Promise<CreateEstablishmentResult> => {
    const response = await fetchWithAuth(
      `${SUPER_ADMIN_URL()}/establishments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible de créer l'établissement")
    }
    return response.json()
  },

  searchAccount: async (email: string): Promise<AccountSearchResult> => {
    const response = await fetchWithAuth(
      `${SUPER_ADMIN_URL()}/users?email=${encodeURIComponent(email)}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de trouver ce compte')
    }
    return response.json()
  },

  // LA SOUPAPE (back/CLAUDE.md, tâche 10) : réémet un lien d'accès pour
  // n'importe quel compte de la plateforme. Le jeton rendu ne doit jamais
  // être journalisé ici — cette fonction se contente de le renvoyer à son
  // appelant, qui l'affiche et rien de plus (voir `users.tsx`).
  reissueAccessLink: async (
    userId: string,
  ): Promise<ReissueAccessLinkResult> => {
    const response = await fetchWithAuth(
      `${SUPER_ADMIN_URL()}/users/${userId}/access-link`,
      { method: 'POST' },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de réémettre le lien')
    }
    return response.json()
  },

  createGrant: async (input: CreateGrantInput): Promise<SuperAdminGrant> => {
    const response = await fetchWithAuth(`${SUPER_ADMIN_URL()}/grants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible de créer l'octroi")
    }
    return response.json()
  },

  revokeGrant: async (id: string): Promise<void> => {
    const response = await fetchWithAuth(`${SUPER_ADMIN_URL()}/grants/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible de révoquer l'octroi")
    }
  },
}
