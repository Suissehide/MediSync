import { establishmentApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  AddMemberInput,
  CreateMemberAccountInput,
  CreateMemberAccountResult,
  Member,
  UpdateMemberInput,
} from '../types/member.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// Toutes les routes de membres sont des routes d'administration
// d'établissement (voir `establishmentApiUrl`), y compris la lecture : seul
// un administrateur d'établissement gère ses membres (permission
// `members:manage`).
const MEMBERS_URL = () => `${establishmentApiUrl()}/members`

// Le back refuse plusieurs actions par construction (voir
// `membership.domain.ts`) : retirer/désactiver le dernier administrateur,
// se retirer/se désactiver soi-même, ou (dés)activer un compte rattaché à
// plusieurs établissements. Ces trois cas partagent le même statut HTTP 409
// sur une même route (retrait, désactivation), donc le statut seul ne
// suffit pas à les distinguer : on lit le message renvoyé par le back (voir
// `error.handler.ts` côté back, qui le transmet tel quel) pour choisir le
// texte affiché à l'utilisateur.
const CONFLICT_MESSAGES: Record<string, { title: string; message: string }> = {
  'Cannot remove the last administrator': {
    title: 'Dernier administrateur',
    message:
      'Cet établissement doit garder au moins un administrateur actif. Nommez un autre administrateur avant de retirer ou de désactiver celui-ci.',
  },
  'Cannot apply this action to your own account': {
    title: 'Action impossible sur son propre compte',
    message:
      'Vous ne pouvez pas retirer ni désactiver votre propre compte depuis cet écran. Demandez à un autre administrateur de le faire.',
  },
  // Le motif affiché ici doit rester celui du back (`assertNotSelfDemotion`
  // dans `membership.domain.ts`) : la symétrie avec l'interdiction de se
  // retirer ou se désactiver soi-même — un compte ne réduit jamais seul ses
  // propres droits, c'est un collègue qui le fait. Surtout pas « vous
  // perdriez le droit de vous le rendre » : ce motif-là est faux, le garde
  // du dernier administrateur assurant qu'il reste toujours quelqu'un pour
  // réparer.
  'Cannot remove your own administrator role': {
    title: 'Retrait de votre propre rôle',
    message:
      "Vous ne pouvez pas retirer votre propre rôle d'administrateur : ce retrait est réservé à un autre administrateur, comme le retrait ou la désactivation de votre propre compte. Demandez à un collègue administrateur de le faire.",
  },
  'This account belongs to several establishments; its activation cannot be changed from here':
    {
      title: 'Compte rattaché à plusieurs établissements',
      message:
        'Ce compte est rattaché à plusieurs établissements : son activation ne peut pas être changée depuis un établissement en particulier.',
    },
}

// Lit le message métier renvoyé par le back pour choisir le texte affiché
// quand plusieurs causes distinctes partagent le même statut HTTP. Si le
// message est inconnu (ou absent), on retombe sur le message par défaut de
// l'appel, via `handleHttpError`.
const throwMemberError = async (
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
  // `handleHttpError` lève toujours une erreur ; cette ligne n'est jamais
  // atteinte mais satisfait le type `never`.
  throw new Error(defaultMessage)
}

export const MembersApi = {
  getAll: async (): Promise<Member[]> => {
    const response = await fetchWithAuth(MEMBERS_URL(), { method: 'GET' })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de récupérer les membres')
    }
    return response.json()
  },

  add: async (input: AddMemberInput): Promise<Member> => {
    const response = await fetchWithAuth(MEMBERS_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {
          // Une adresse inconnue et une adresse déjà membre renvoient
          // volontairement la même erreur, indistinguable, pour ne pas
          // permettre à un administrateur d'énumérer les comptes de la
          // plateforme (voir `membership.domain.ts`, `UNADDABLE_EMAIL`) : on
          // affiche donc un message unique et neutre, sans reconstruire la
          // distinction côté front.
          400: {
            title: 'Ajout impossible',
            message:
              "Cette adresse ne peut pas être ajoutée : vérifiez qu'elle correspond à un compte existant qui n'est pas déjà membre de cet établissement.",
          },
        },
        "Impossible d'ajouter le membre",
      )
    }
    return response.json()
  },

  // `POST /e/:establishmentId/admin/members/account` (tâche 13, step 3) :
  // le chemin réel est SANS `/admin` dans le brief mais ce routeur est monté
  // sous ce préfixe (voir le commentaire du back, `members.ts`) —
  // `MEMBERS_URL()` le porte déjà.
  createAccount: async (
    input: CreateMemberAccountInput,
  ): Promise<CreateMemberAccountResult> => {
    const response = await fetchWithAuth(`${MEMBERS_URL()}/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {
          400: {
            title: 'Création impossible',
            message:
              'Cette adresse a déjà un compte : utilisez plutôt "Ajouter un membre" pour la rattacher.',
          },
        },
        'Impossible de créer le compte',
      )
    }
    return response.json()
  },

  update: async ({ id, ...input }: UpdateMemberInput): Promise<Member> => {
    const response = await fetchWithAuth(`${MEMBERS_URL()}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      await throwMemberError(response, 'Impossible de modifier le membre')
    }
    return response.json()
  },

  remove: async (id: string): Promise<void> => {
    const response = await fetchWithAuth(`${MEMBERS_URL()}/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      await throwMemberError(response, 'Impossible de retirer le membre')
    }
  },

  deactivate: async (id: string): Promise<Member> => {
    const response = await fetchWithAuth(`${MEMBERS_URL()}/${id}/deactivate`, {
      method: 'POST',
    })
    if (!response.ok) {
      await throwMemberError(response, 'Impossible de désactiver le compte')
    }
    return response.json()
  },

  reactivate: async (id: string): Promise<Member> => {
    const response = await fetchWithAuth(`${MEMBERS_URL()}/${id}/reactivate`, {
      method: 'POST',
    })
    if (!response.ok) {
      await throwMemberError(response, 'Impossible de réactiver le compte')
    }
    return response.json()
  },
}
