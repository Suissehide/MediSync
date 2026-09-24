import { AuthApi } from './auth.api.ts'

let isRefreshing = false
let refreshPromise: Promise<Response> | null = null

// Rappel declenche par un 404 de route de tenant (cf. plus bas), a qui l'on
// passe le CHEMIN de la reponse en echec — le rappel recharge l'arbre des
// appartenances et decide lui-meme, avec ce chemin, si le 404 est legitime
// ou signale un arbre perime. Enregistre depuis `main.tsx`, jamais defini
// ici : ce module ne doit dependre ni du routeur ni du client de requetes,
// tous deux hors de sa portee.
let onStaleTenant: ((pathname: string) => Promise<void>) | undefined

export const registerStaleTenantHandler = (
  handler: (pathname: string) => Promise<void>,
): void => {
  onStaleTenant = handler
}

// Plusieurs requetes peuvent echouer par 404 en meme temps (un ecran qui
// charge plusieurs ressources d'un coup, toutes retirees ensemble) : sans ce
// garde-fou, chacune relancerait son propre rechargement de `/me` et sa
// propre verification. Meme forme que `isRefreshing`/`refreshPromise`
// ci-dessus, pour le meme besoin — a la difference que rien n'attend ici le
// resultat pour rejouer une requete : le 404 en cours reste un 404, quelle
// que soit la conclusion de la verification. Elle est donc laissee courir en
// tache de fond, jamais attendue avant de renvoyer la reponse.
let isCheckingStaleTenant = false

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

  // Un 404 sur une route de tenant PEUT signifier que l'arbre des
  // appartenances du front est perime — affectation retiree pendant la
  // session — mais peut tout aussi bien etre une simple ressource absente du
  // service courant, couple toujours valide : le 404 est deliberement
  // neutre cote back, pour ne rien reveler a qui sonde des identifiants au
  // hasard, donc rien ici ne permet de distinguer les deux cas. On delegue
  // la distinction au rappel (cf. `isTenantRouteStale`, qui la fait en
  // rechargeant l'arbre et en le reverifiant), et on se contente ici de
  // borner QUAND l'interroger.
  //
  // Restreint aux routes commencant par `/e/` (`tenantApiUrl` et
  // `establishmentApiUrl`) : un 404 sur `/me` ou sur une ressource hors
  // tenant ne doit rien declencher.
  if (
    response.status === 404 &&
    new URL(response.url).pathname.startsWith('/e/') &&
    onStaleTenant &&
    !isCheckingStaleTenant
  ) {
    isCheckingStaleTenant = true
    void onStaleTenant(new URL(response.url).pathname).finally(() => {
      isCheckingStaleTenant = false
    })
  }

  return response
}
