import { apiUrl, tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  InviteServiceMemberInput,
  InviteServiceMemberResult,
  ServiceMember,
} from '../types/serviceMember.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// Membres du service courant (2026-09-29). Lecture pour tout membre du service
// (`members:read`) ; le rattachement a un soignant, pour le coordinateur
// (`referentials:write`). Sous le prefixe de service : c'est le seul endroit ou les
// soignants, propres a chaque service, sont lisibles.
//
// Inviter, changer le role et retirer suivent `service-members:manage` (MDS-17) : le perimetre
// s'arrete au service courant, les comptes et les rattachements d'etablissement restant a
// l'administration (`members:manage`).

// Plusieurs refus du back partagent un meme statut sur une meme route : le message decide du
// texte affiche. Meme dispositif que `members.api.ts`, et le texte doit rester fidele au motif
// ecrit dans `membership.domain.ts` — le modifier d'un cote sans l'autre fait retomber l'ecran
// sur son message generique.
const CONFLICT_MESSAGES: Record<string, { title: string; message: string }> = {
  'This account is already a member of this service': {
    title: 'Déjà dans ce service',
    message:
      'Ce compte est déjà membre de ce service : changez son rôle plutôt que de l’inviter à nouveau.',
  },
  'Cannot apply this action to your own account': {
    title: 'Action impossible sur son propre compte',
    message:
      'Vous ne pouvez pas changer votre propre rôle ni vous retirer de ce service. Demandez-le à un autre coordinateur, ou au chef d’établissement.',
  },
  'This account is deactivated and cannot be added as a member': {
    title: 'Compte désactivé',
    message:
      'Ce compte est désactivé : sa réactivation relève du chef d’établissement.',
  },
}

const throwServiceMemberError = async (
  response: Response,
  defaultMessage: string,
): Promise<never> => {
  let backendMessage: string | undefined
  try {
    const body = (await response.json()) as { message?: string }
    backendMessage = body?.message
  } catch {
    backendMessage = undefined
  }
  const override = backendMessage
    ? CONFLICT_MESSAGES[backendMessage]
    : undefined
  handleHttpError(
    response,
    override ? { [response.status]: override } : {},
    defaultMessage,
  )
  throw new Error(defaultMessage)
}

export const ServiceMembersApi = {
  getAll: async (): Promise<ServiceMember[]> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/membres`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer les membres du service',
      )
    }
    return response.json()
  },

  invite: async (
    input: InviteServiceMemberInput,
  ): Promise<InviteServiceMemberResult> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/membres`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      await throwServiceMemberError(
        response,
        // Le 400 du back est volontairement OPAQUE (compte super-admin, compte rattache a un
        // autre etablissement) : ne pas reconstruire la distinction ici, ce serait rendre a
        // l'ecran l'oracle que le back refuse de donner.
        "Cette adresse ne peut pas être invitée. Si la personne exerce déjà dans un autre établissement, son rattachement passe par l'administration.",
      )
    }
    return response.json()
  },

  setRole: async ({
    affectationId,
    role,
  }: {
    affectationId: string
    role: ServiceMember['role']
  }): Promise<ServiceMember> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/membres/${affectationId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      },
    )
    if (!response.ok) {
      await throwServiceMemberError(
        response,
        'Impossible de changer le rôle dans ce service',
      )
    }
    return response.json()
  },

  remove: async (affectationId: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/membres/${affectationId}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      await throwServiceMemberError(
        response,
        'Impossible de retirer ce membre du service',
      )
    }
  },

  // Le soignant que le compte connecté incarne dans ce service, réglé par lui-même.
  setOwnSoignant: async ({
    establishmentId,
    serviceId,
    soignantId,
  }: {
    establishmentId: string
    serviceId: string
    soignantId: string | null
  }): Promise<ServiceMember> => {
    const response = await fetchWithAuth(
      `${apiUrl}/e/${establishmentId}/s/${serviceId}/membres/me/soignant`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soignantId }),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de changer votre soignant')
    }
    return response.json()
  },

  // `affectationId` : l'identifiant de l'affectation de service (la ligne renvoyee par
  // `getAll`), pas celui du compte.
  setSoignant: async ({
    affectationId,
    soignantId,
  }: {
    affectationId: string
    soignantId: string | null
  }): Promise<ServiceMember> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/membres/${affectationId}/soignant`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soignantId }),
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de rattacher ce compte au soignant',
      )
    }
    return response.json()
  },
}
