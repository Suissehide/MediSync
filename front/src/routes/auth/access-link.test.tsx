import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AnyRoute } from '@tanstack/react-router'
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routeTree as vraiRouteTree } from '@/routeTree.gen.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AuthState } from '@/types/auth.ts'
import { Route as accessLinkRoute } from './access-link.tsx'

// La page publique de consommation d'un lien d'accès — LE POINT LE PLUS SENSIBLE : le jeton
// arrive dans l'URL du navigateur (c'est ainsi qu'on le transmet), mais ne doit JAMAIS repartir
// dans l'URL d'un appel d'API, ni dans une clé de cache, ni dans un journal
// de console — mêmes quatre canaux qu'`accountSearchPanel.test.tsx`, chacun éprouvé par une
// injection distincte.
//
// Cette page vit sous `routes/auth/`, donc HORS de `_authenticated` :
// atteignable SANS SESSION — vérifié ci-dessous plutôt que supposé (aucun
// `authState.isAuthenticated` n'est jamais posé à `true` dans ce fichier).

const JETON = 'jeton-lien-acces-a-ne-jamais-fuiter-dans-une-url'

const optionsDe = (route: AnyRoute) => route.options

const utilisateurConnecte = {
  id: 'u1',
  email: 'nouveau@chu.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [],
}

const rootRoute = createRootRouteWithContext<{ authState: AuthState }>()({
  component: () => <Outlet />,
})

const accessLinkTestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'auth/access-link',
  validateSearch: optionsDe(accessLinkRoute).validateSearch,
  component: optionsDe(accessLinkRoute).component,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <div>Tableau de bord</div>,
})

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'auth',
  component: () => <div>Page de connexion</div>,
})

const routeTree = rootRoute.addChildren([
  accessLinkTestRoute,
  indexRoute,
  authRoute,
])

type Route = {
  match: (url: string, method: string) => boolean
  respond: () => { ok: boolean; status: number; json: () => Promise<unknown> }
}

const buildFetchMock = (routes: Route[]) =>
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    const route = routes.find((r) => r.match(url, method))
    if (!route) {
      throw new Error(`Appel fetch non attendu dans ce test : ${method} ${url}`)
    }
    const result = route.respond()
    return { ...result, url }
  })

const monter = (path: string, fetchMock: ReturnType<typeof buildFetchMock>) => {
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    // JAMAIS `isAuthenticated: true` sur CET arbre synthetique : voir plus
    // bas, describe dedie, pour la preuve d'atteignabilite sans session sur
    // le VRAI arbre de routes — cet arbre-ci ne peut rien prouver sur ce
    // point, il ne declare meme pas de route `_authenticated`.
    context: { authState: { isAuthenticated: false, user: null } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

const routeConsume = (respond: Route['respond']): Route => ({
  match: (url, method) =>
    url.endsWith('/auth/access-link/consume') && method === 'POST',
  respond,
})

const routeSignIn = (respond: Route['respond']): Route => ({
  match: (url, method) => url.endsWith('/auth/sign-in') && method === 'POST',
  respond,
})

const remplirEtValider = async (password: string) => {
  await userEvent.type(
    screen.getByLabelText(/^nouveau mot de passe/i),
    password,
  )
  await userEvent.type(
    screen.getByLabelText(/confirmer le mot de passe/i),
    password,
  )
  await userEvent.click(
    screen.getByRole('button', {
      name: /définir le mot de passe et se connecter/i,
    }),
  )
}

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: false, user: null, context: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('page publique de consommation d un lien d acces', () => {
  it('sans jeton dans l URL : message invalide, aucun appel reseau tente', async () => {
    const fetchMock = buildFetchMock([])
    monter('/auth/access-link', fetchMock)

    expect(await screen.findByText(/ce lien est invalide/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('410 (lien invalide ou expire) : message distinct, invite a en demander un autre', async () => {
    monter(
      `/auth/access-link#${JETON}`,
      buildFetchMock([
        routeConsume(() => ({
          ok: false,
          status: 410,
          json: async () => ({}),
        })),
      ]),
    )

    await remplirEtValider('un-mot-de-passe-suffisant')

    expect(
      await screen.findByText(/ce lien n'est plus valable/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/compte est désactivé/i)).not.toBeInTheDocument()
  })

  it('401 (compte desactive) : message distinct du 410, ne parle jamais de lien invalide', async () => {
    monter(
      `/auth/access-link#${JETON}`,
      buildFetchMock([
        routeConsume(() => ({
          ok: false,
          status: 401,
          json: async () => ({}),
        })),
      ]),
    )

    await remplirEtValider('un-mot-de-passe-suffisant')

    expect(await screen.findByText(/compte est désactivé/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/lien n'est plus valable/i),
    ).not.toBeInTheDocument()
  })

  it('succes : consomme puis appelle la connexion ordinaire avec l adresse et le mot de passe saisis, puis navigue', async () => {
    const fetchMock = buildFetchMock([
      routeConsume(() => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, email: 'quelqu.un@chu.fr' }),
      })),
      routeSignIn(() => ({
        ok: true,
        status: 201,
        json: async () => utilisateurConnecte,
      })),
    ])
    monter(`/auth/access-link#${JETON}`, fetchMock)

    await remplirEtValider('un-mot-de-passe-suffisant')

    await waitFor(() => {
      expect(screen.getByText('Tableau de bord')).toBeInTheDocument()
    })

    const consumeCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/access-link/consume'),
    )
    expect(consumeCall).toBeDefined()
    expect(JSON.parse(String(consumeCall?.[1]?.body))).toEqual({
      token: JETON,
      password: 'un-mot-de-passe-suffisant',
    })

    const signInCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/sign-in'),
    )
    expect(signInCall).toBeDefined()
    expect(JSON.parse(String(signInCall?.[1]?.body))).toEqual({
      email: 'quelqu.un@chu.fr',
      password: 'un-mot-de-passe-suffisant',
    })
  })

  it('consommation reussie mais connexion echouee : message distinct, le formulaire ne repropose pas de reconsommer le jeton', async () => {
    const fetchMock = buildFetchMock([
      routeConsume(() => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, email: 'quelqu.un@chu.fr' }),
      })),
      routeSignIn(() => ({ ok: false, status: 401, json: async () => ({}) })),
    ])
    monter(`/auth/access-link#${JETON}`, fetchMock)

    await remplirEtValider('un-mot-de-passe-suffisant')

    expect(
      await screen.findByText(/la connexion automatique a échoué/i),
    ).toBeInTheDocument()
    // Le formulaire (avec ses champs email/mot de passe) a disparu : le
    // jeton est brûlé (usage unique), retenter reviendrait à consommer un
    // jeton déjà consommé.
    expect(
      screen.queryByLabelText(/^nouveau mot de passe/i),
    ).not.toBeInTheDocument()

    const consumeCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/access-link/consume'),
    )
    expect(consumeCalls).toHaveLength(1)
  })

  // Cinquieme canal a verifier. Login volontairement en echec (401, deterministe) pour observer
  // l'etat du routeur JUSTE apres la purge, sans dependre de l'issue de la
  // connexion qui suit.
  it("purge le jeton de l'URL et REMPLACE l'entree d'historique des la consommation reussie, avant meme la connexion", async () => {
    const fetchMock = buildFetchMock([
      routeConsume(() => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, email: 'quelqu.un@chu.fr' }),
      })),
      routeSignIn(() => ({ ok: false, status: 401, json: async () => ({}) })),
    ])
    const { router } = monter(`/auth/access-link#${JETON}`, fetchMock)
    const longueurHistoriqueAvant = router.history.length

    await remplirEtValider('un-mot-de-passe-suffisant')

    await screen.findByText(/la connexion automatique a échoué/i)

    // Le jeton n'est plus dans la recherche d'URL courante...
    expect(router.state.location.hash).toBe('')
    expect(String(router.state.location.href)).not.toContain(JETON)
    // ...et aucune NOUVELLE entree d'historique n'a ete empilee : c'est un
    // REMPLACEMENT (`replace: true`), pas une navigation ordinaire — un
    // retour arriere ne peut donc plus jamais retomber sur l'URL porteuse
    // du jeton, qui n'existe plus dans l'historique.
    expect(router.history.length).toBe(longueurHistoriqueAvant)
  })

  // Le back exige 12 caracteres
  // (`accessLinkConsumeSchema`) ; sans ce controle cote client, huit
  // caracteres partaient en requete, revenaient 400, et l'ecran affichait
  // une phrase qui ne parlait jamais de longueur — sur l'ecran par lequel
  // une personne ENTRE dans l'application. Precedent existant : `user/settings.tsx` (« Le mot
  // de passe doit contenir au moins 12 caracteres »).
  it('un mot de passe trop court est refuse cote client, avec le message exact, avant tout appel reseau', async () => {
    const fetchMock = buildFetchMock([])
    monter(`/auth/access-link#${JETON}`, fetchMock)

    await userEvent.type(
      screen.getByLabelText(/^nouveau mot de passe/i),
      'trop-court',
    )
    // Blur explicite (clic sur le champ suivant) : declenche la validation.
    await userEvent.click(screen.getByLabelText(/confirmer le mot de passe/i))

    expect(
      await screen.findByText(/doit contenir au moins 12 caractères/i),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // La banniere d'erreur affichait UNE
  // PHRASE FIGEE quel que soit le statut (« Une erreur est survenue.
  // Verifiez... »), qui ne reflete jamais le VRAI message d'erreur. Ici, un
  // 500 (ni 410 ni 401) doit afficher le message reel de l'API, et laisser
  // le formulaire utilisable — rien ne prouve que le jeton a ete consomme
  // par une simple panne serveur.
  it("une erreur qui n'est ni 410 ni 401 affiche le vrai message d'API, pas une phrase figee, et laisse le formulaire pour reessayer", async () => {
    monter(
      `/auth/access-link#${JETON}`,
      buildFetchMock([
        routeConsume(() => ({
          ok: false,
          status: 500,
          json: async () => ({}),
        })),
      ]),
    )

    await remplirEtValider('un-mot-de-passe-suffisant')

    expect(
      await screen.findByText(/une erreur interne est survenue/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/vérifiez les informations saisies et réessayez/i),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^nouveau mot de passe/i)).toBeInTheDocument()
  })

  it("le jeton n'atterrit jamais ailleurs qu'a l'ecran (quatre canaux)", async () => {
    const consoleSpies = (
      ['log', 'warn', 'error', 'info', 'debug'] as const
    ).map((methode) =>
      vi.spyOn(console, methode).mockImplementation(() => undefined),
    )

    const fetchMock = buildFetchMock([
      routeConsume(() => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, email: 'quelqu.un@chu.fr' }),
      })),
      routeSignIn(() => ({
        ok: true,
        status: 201,
        json: async () => utilisateurConnecte,
      })),
    ])
    const { queryClient } = monter(`/auth/access-link#${JETON}`, fetchMock)

    await remplirEtValider('un-mot-de-passe-suffisant')

    await waitFor(() => {
      expect(screen.getByText('Tableau de bord')).toBeInTheDocument()
    })

    // Canal 1/4 — jamais dans la VALEUR d'une entrée du cache des requêtes.
    const cachesAvecLeJetonEnValeur = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => JSON.stringify(query.state.data ?? '').includes(JETON))
    expect(cachesAvecLeJetonEnValeur).toEqual([])

    // Canal 2/4 — jamais dans la CLÉ d'une entrée du cache.
    const cachesAvecLeJetonEnCle = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => JSON.stringify(query.queryKey).includes(JETON))
    expect(cachesAvecLeJetonEnCle).toEqual([])

    // Canal 3/4 — jamais dans l'URL d'un appel réseau (le jeton part dans
    // le CORPS du POST de consommation, jamais dans son URL).
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain(JETON)
    }

    // Canal 4/4 — jamais dans un journal de console.
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(JETON)
      }
    }
  })
})

// Le harnais synthetique ci-dessus ne prouve pas
// l'atteignabilite sans session — il construit son propre arbre, ou aucun
// `_authenticated` ne figure ; rien n'aurait donc pu rediriger, quelle que
// soit la place reelle du fichier. Ce describe utilise le VRAI
// `routeTree.gen.ts` — celui que `main.tsx` monte reellement — pour
// verifier la SEULE chose que l'arbre synthetique ci-dessus ne peut pas
// prouver : que `/auth/access-link` est bien enregistree HORS DE
// `_authenticated` dans l'arbre reel, donc jamais redirigee vers `/auth`
// meme sans session.
describe('atteignabilite sans session, sur le VRAI arbre de routes', () => {
  it('le vrai routeTree.gen.ts place access-link hors de _authenticated : aucune redirection vers /auth sans session', async () => {
    const fetchMock = buildFetchMock([])
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree: vraiRouteTree,
      history: createMemoryHistory({
        initialEntries: [`/auth/access-link#${JETON}`],
      }),
      // JAMAIS authentifie : c'est exactement le cas que cette page doit
      // servir. Si `access-link.tsx` etait (par erreur) enregistre sous
      // `_authenticated`, son `beforeLoad` redirigerait ici vers `/auth`.
      context: {
        queryClient,
        authState: { isAuthenticated: false, user: null },
      },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(
      await screen.findByText(/choisissez votre mot de passe/i),
    ).toBeInTheDocument()
    // La page de connexion (`routes/auth/index.tsx`) porte ce titre : son
    // absence prouve qu'aucune redirection vers `/auth` n'a eu lieu.
    expect(screen.queryByText(/^s'identifier$/i)).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/auth/access-link')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
