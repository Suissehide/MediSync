import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  AccountSearchResult,
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
  getEstablishment: async (establishmentId: string): Promise<EstablishmentDetail> => {
    const response = await fetchWithAuth(
      `${SUPER_ADMIN_URL()}/establishments/${establishmentId}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        "Impossible de récupérer l'établissement",
      )
    }
    return response.json()
  },

  // `createEstablishment` (POST /super-admin/establishments) a été retiré
  // ici (tour de correction 1, Important n°5) : aucun écran ne l'appelait,
  // aucun test ne le couvrait, et sa réponse portait un second jeton en
  // clair (`accessLink.token`) qu'aucune garde ne surveillait — un type qui
  // promettait « jamais journalisé, jamais mis en cache » sans qu'aucun code
  // ne tienne cette promesse. Les steps du brief (liste, détail, recherche
  // de compte) ne demandent pas d'écran de création ; à réintroduire avec
  // son écran ET sa garde le jour où l'un et l'autre sont commandés.

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
  reissueAccessLink: async (userId: string): Promise<ReissueAccessLinkResult> => {
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
