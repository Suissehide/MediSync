import { AuthApi } from './auth.api.ts'

let isRefreshing = false
let refreshPromise: Promise<Response> | null = null

// Rappel declenche par un 404 de tenant perime (cf. plus bas). Enregistre
// depuis `main.tsx`, jamais defini ici : ce module ne doit dependre ni du
// routeur ni du client de requetes, tous deux hors de sa portee.
let onStaleTenant: (() => void) | undefined

export const registerStaleTenantHandler = (handler: () => void): void => {
  onStaleTenant = handler
}

export const fetchWithAuth = async (
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> => {
  const makeRequest = () =>
    fetch(input, {
      ...init,
      credentials: 'include',
    })

  let response = await makeRequest()

  if (response.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true
      refreshPromise = AuthApi.refresh()
    }

    try {
      const refreshResponse = await refreshPromise
      isRefreshing = false

      if (refreshResponse?.ok) {
        response = await makeRequest()
      } else {
        window.location.href = '/auth'
        return Promise.reject(new Error('Session expired'))
      }
    } catch {
      isRefreshing = false
      window.location.href = '/auth'
      return Promise.reject(new Error('Session expired'))
    }
  }

  // Un 404 sur une route de tenant, alors que le front croyait le couple
  // valide, signifie que son arbre des appartenances est perime : le back
  // fait foi. On le recharge et on renvoie au choix de contexte, plutot que
  // d'afficher une erreur incomprehensible.
  //
  // Restreint aux routes commencant par `/e/` (`tenantApiUrl` et
  // `establishmentApiUrl`) : un 404 sur `/me` ou sur une ressource absente
  // du service courant (patient, creneau... inexistant, mais couple valide)
  // ne doit rien declencher. Ce dernier cas reste indiscernable d'un tenant
  // perime a la seule forme de l'URL — un 404 « ressource absente » sous
  // `/e/...` declenche donc, a tort, le meme aller-retour vers le choix de
  // contexte. Le cout : un rechargement de `/me` et une navigation superflus
  // au lieu d'un message d'erreur cible, jamais une donnee corrompue ni un
  // etat incoherent.
  if (response.status === 404 && new URL(response.url).pathname.startsWith('/e/')) {
    onStaleTenant?.()
  }

  return response
}
