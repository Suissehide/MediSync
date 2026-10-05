import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  ConsumeAccessLinkInput,
  RegisterInput,
  User,
} from '../types/auth.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const AuthApi = {
  login: async (email: string, password: string): Promise<User> => {
    const response = await fetch(`${apiUrl}/auth/sign-in`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {
          400: {
            title: 'Format invalide',
            message: 'Vérifie ton email et ton mot de passe',
          },
          401: {
            title: 'Identifiants incorrects',
            message: 'L’email ou le mot de passe est incorrect',
          },
        },
        'Impossible de se connecter',
      )
    }
    return response.json()
  },

  logout: async (): Promise<void> => {
    const response = await fetch(`${apiUrl}/auth/sign-out`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {
          401: {
            title: 'Session expirée',
            message: 'Vous devez être connecté pour vous déconnecter',
          },
        },
        'Erreur lors de la déconnexion',
      )
    }
    return
  },

  refresh: async (): Promise<Response> => {
    const response = await fetch(`${apiUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Erreur lors de la mise à jour du cookie')
    }
    return response
  },

  register: async (registerInput: RegisterInput): Promise<Response> => {
    const response = await fetch(`${apiUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerInput),
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {
          400: {
            title: 'Informations invalides',
            message: 'Certains champs sont incorrects ou manquants',
          },
          409: {
            title: 'Compte existant',
            message: 'Un utilisateur avec cet email existe déjà',
          },
        },
        'Erreur lors de l’inscription',
      )
    }
    return response
  },

  // `POST /auth/access-link/consume` (page publique) : le jeton
  // est un mot de passe à usage unique, transmis dans l'URL du navigateur
  // mais qui part ICI dans le CORPS de la requête — jamais dans l'URL de
  // cet appel (voir `back/.../auth/access-link.router.ts`, même exigence
  // que côté back). `fetch` brut, PAS `fetchWithAuth` : il n'existe aucune
  // session à ce stade, et un 401 ici signifie « compte désactivé », pas
  // « session expirée » — `fetchWithAuth` traiterait ce 401 comme une
  // session à rafraîchir et redirigerait vers `/auth`, un contresens total
  // sur cette route.
  consumeAccessLink: async ({
    token,
    password,
  }: ConsumeAccessLinkInput): Promise<{ success: boolean; email: string }> => {
    const response = await fetch(`${apiUrl}/auth/access-link/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {
          410: {
            title: 'Lien invalide',
            message: "Ce lien n'est plus valable.",
          },
          401: {
            title: 'Compte désactivé',
            message: 'Ce compte est désactivé.',
          },
        },
        'Impossible de définir le mot de passe',
      )
    }
    return response.json()
  },

  // Toujours 204, que l'adresse existe ou non.
  forgotPassword: async (email: string): Promise<void> => {
    const response = await fetch(`${apiUrl}/auth/password-forgot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {
          429: {
            title: 'Trop de demandes',
            message: 'Réessayez dans quelques minutes.',
          },
        },
        "Impossible d'envoyer l'e-mail",
      )
    }
  },

  me: async (): Promise<User> => {
    const response = await fetchWithAuth(`${apiUrl}/me`, { method: 'GET' })
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible de récupérer l'utilisateur")
    }
    return response.json()
  },

  updateMe: async (params: {
    firstName?: string
    lastName?: string
    currentPassword?: string
    newPassword?: string
  }): Promise<User> => {
    const response = await fetchWithAuth(`${apiUrl}/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de mettre à jour le compte')
    }
    return response.json()
  },
}
