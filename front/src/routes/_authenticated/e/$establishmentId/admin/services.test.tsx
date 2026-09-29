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
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AuthState, User } from '@/types/auth.ts'
import { Route as adminRoute } from '../admin.tsx'
import { Route as servicesRoute } from './services.tsx'

// `ReactTable` virtualise ses lignes (`@tanstack/react-virtual`) : sous
// jsdom, le conteneur de defilement mesure toujours une taille nulle, donc
// le virtualiseur REEL ne rend aucune ligne, quel que soit le nombre de
// donnees — un artefact de l'environnement de test, pas du composant. Ce
// mock local rend TOUTES les lignes, pour eprouver le VRAI `services.tsx`
// et les VRAIES colonnes de `service.column.tsx` sans reecrire l'un ou
// l'autre.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        start: index * options.estimateSize(),
        end: (index + 1) * options.estimateSize(),
        size: options.estimateSize(),
      })),
    getTotalSize: () => options.count * options.estimateSize(),
    scrollToIndex: () => undefined,
    measure: () => undefined,
    measureElement: () => undefined,
  }),
}))

// Onglet des services (tâche 13, step 1). Deux lecons du brief verrouillees
// ici :
// 1. « Distingue toujours trois etats » (chargement/erreur/vide) — la
//    tache 12 a livre un « Chargement... » perpetuel sur une erreur.
// 2. Les DEUX compteurs de l'impact de desactivation NE DISENT PAS LA MEME
//    CHOSE : `suivisIci` et `suivisNullePartAilleurs` doivent rester
//    distincts a l'ecran, avec une fixture ou ils DIFFERENT — sinon rien ne
//    prouve qu'on affiche le bon.

dayjs.extend(utc)

const optionsDe = (route: AnyRoute) => route.options

const admin: User = {
  id: 'u1',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [{ id: 'e1', name: 'CHU', role: 'ADMIN', services: [] }],
}

const rootRoute = createRootRouteWithContext<{ authState: AuthState }>()({
  component: () => <Outlet />,
})
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '/_authenticated',
  component: () => <Outlet />,
})
const adminLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'e/$establishmentId/admin',
  beforeLoad: optionsDe(adminRoute).beforeLoad,
  remountDeps: optionsDe(adminRoute).remountDeps,
  component: () => <Outlet />,
})
const servicesScreenRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'services',
  beforeLoad: optionsDe(servicesRoute).beforeLoad,
  component: optionsDe(servicesRoute).component,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    adminLayoutRoute.addChildren([servicesScreenRoute]),
  ]),
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

const monter = (routes: Route[]) => {
  vi.stubGlobal('fetch', buildFetchMock(routes))
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/e/e1/admin/services'] }),
    context: { authState: { isAuthenticated: true, user: admin } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const serviceActif = {
  id: 's1',
  name: 'Cardio',
  createdAt: '2025-01-01T00:00:00.000Z',
  deactivatedAt: null,
}
const serviceDesactive = {
  id: 's2',
  name: 'Neuro',
  createdAt: '2025-02-01T00:00:00.000Z',
  deactivatedAt: '2025-06-01T00:00:00.000Z',
}

const routeGetServices = (data: unknown): Route => ({
  match: (url, method) => url.endsWith('/admin/services') && method === 'GET',
  respond: () => ({ ok: true, status: 200, json: async () => data }),
})

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: admin, context: null })
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('etats de l ecran des services', () => {
  it('affiche un etat de chargement tant que la reponse n est pas arrivee', async () => {
    // Une promesse qui ne se regle jamais : la requete reste `isPending`
    // indefiniment, exactement l'etat que ce cas verifie (meme convention
    // que `super-admin/$establishmentId.test.tsx`).
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(() => {
            // Ne se regle jamais.
          }),
      ),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/e/e1/admin/services'],
      }),
      context: { authState: { isAuthenticated: true, user: admin } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(await screen.findByText(/chargement/i)).toBeInTheDocument()
    expect(screen.queryByText(/impossible de charger/i)).not.toBeInTheDocument()
  })

  it('affiche une erreur distincte, jamais un chargement perpetuel, sur une panne', async () => {
    monter([
      {
        match: (url, method) =>
          url.endsWith('/admin/services') && method === 'GET',
        respond: () => ({ ok: false, status: 500, json: async () => ({}) }),
      },
    ])

    await waitFor(() => {
      expect(
        screen.getByText(/impossible de charger les services/i),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText(/^chargement/i)).not.toBeInTheDocument()
  })

  it('affiche un etat vide distinct quand la liste est vide', async () => {
    monter([routeGetServices([])])

    await waitFor(() => {
      expect(
        screen.getByText(/aucun service pour le moment/i),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText(/impossible de charger/i)).not.toBeInTheDocument()
  })

  it('affiche le contenu une fois la reponse arrivee', async () => {
    monter([routeGetServices([serviceActif, serviceDesactive])])

    await waitFor(() => {
      expect(screen.getByText('Cardio')).toBeInTheDocument()
      expect(screen.getByText('Neuro')).toBeInTheDocument()
    })
    expect(screen.queryByText(/chargement/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/impossible de charger/i)).not.toBeInTheDocument()
  })

  // Revue finale de l'étape 4a, Important n°3 : « identifiants copiables »
  // (decisions-etape-4a.md, D3/D4) n'etait tenu que pour l'etablissement —
  // le geste de depannage reel n'avait nulle part ou se poser sur cet
  // ecran non plus.
  it("affiche l'identifiant du service, copiable", async () => {
    monter([routeGetServices([serviceActif])])

    await waitFor(() => {
      expect(screen.getByText('Cardio')).toBeInTheDocument()
    })

    expect(screen.getByText(serviceActif.id)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /copier l'identifiant/i }),
    ).toBeInTheDocument()
  })

  // Mineur (tour de correction 1, tâche 13) : cette propriété n'avait pas
  // de nom propre - elle vivait implicitement sous un test qui parle de
  // REACTIVATION (« reactiver ne calcule aucun impact »), qui ne couvre pas
  // le simple RENDU de la liste. `buildFetchMock` leve deja sur un appel
  // non attendu, mais aucune assertion ne le nommait : un `useEffect` qui
  // appellerait l'impact pour chaque service au montage laisserait passer
  // ce test-la aussi si personne ne cherche precisement cette propriete.
  it("n'appelle jamais la route d'impact au simple rendu de la liste, avant toute interaction", async () => {
    const fetchMock = buildFetchMock([
      routeGetServices([serviceActif, serviceDesactive]),
    ])
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/e/e1/admin/services'],
      }),
      context: { authState: { isAuthenticated: true, user: admin } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await screen.findByText('Cardio')
    await screen.findByText('Neuro')

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('impact-desactivation'),
      ),
    ).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('desactivation d un service : les deux compteurs', () => {
  it('affiche les DEUX compteurs distinctement quand ils different, avant de confirmer', async () => {
    monter([
      routeGetServices([serviceActif]),
      {
        match: (url, method) =>
          url.endsWith('/admin/services/s1/impact-desactivation') &&
          method === 'GET',
        // Fixture ou les deux nombres DIFFERENT : sinon rien ne prouve
        // qu'on affiche le bon des deux (brief tache 13).
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({ suivisIci: 5, suivisNullePartAilleurs: 2 }),
        }),
      },
    ])

    await screen.findByText('Cardio')
    await userEvent.click(
      screen.getByRole('button', { name: /désactiver le service/i }),
    )

    // Tour de correction 1, Critique n°1 : `getByText('5')` /
    // `getByText('2')` existent et sont forcement des noeuds distincts
    // (deux requetes de texte exact ne peuvent jamais rendre le meme
    // noeud) - ca ne prouve RIEN sur QUEL nombre porte QUEL libelle. Le
    // relecteur a echange les deux libelles dans `services.tsx` (le nombre
    // sous « suivis ici » devient celui qui compte, et inversement) et les
    // neuf tests precedents restaient verts. On attache donc chaque
    // assertion au CONTENEUR du libelle, pas au noeud de texte nu.
    await screen.findByText(/suivis dans ce service/i)
    const suivisIciParagraphe = screen
      .getByText(/suivis dans ce service/i)
      .closest('p')
    const suivisAilleursParagraphe = screen
      .getByText(/deviendront invisibles partout/i)
      .closest('p')
    expect(suivisIciParagraphe).not.toBeNull()
    expect(suivisAilleursParagraphe).not.toBeNull()

    // Le nombre qui compte pour DECIDER (`suivisNullePartAilleurs`, ceux
    // qui deviendront invisibles PARTOUT) doit porter la valeur 2, jamais 5
    // - et reciproquement pour `suivisIci`. Chaque assertion NEGATIVE est
    // ce qui fait rougir un echange de libelles : une assertion purement
    // positive («5 est present quelque part») resterait verte meme
    // echangee.
    expect(suivisIciParagraphe).toHaveTextContent('5')
    expect(suivisIciParagraphe).not.toHaveTextContent('2')
    expect(suivisAilleursParagraphe).toHaveTextContent('2')
    expect(suivisAilleursParagraphe).not.toHaveTextContent('5')

    expect(
      screen.getByText(/resteront en base mais ne seront plus accessibles/i),
    ).toBeInTheDocument()
  })

  it('la confirmation envoie bien la desactivation, avec le bon identifiant', async () => {
    const fetchMock = buildFetchMock([
      routeGetServices([serviceActif]),
      {
        match: (url, method) =>
          url.endsWith('/admin/services/s1/impact-desactivation') &&
          method === 'GET',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({ suivisIci: 5, suivisNullePartAilleurs: 2 }),
        }),
      },
      {
        match: (url, method) =>
          url.endsWith('/admin/services/s1') && method === 'PATCH',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({
            ...serviceActif,
            deactivatedAt: '2026-01-01T00:00:00.000Z',
          }),
        }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/e/e1/admin/services'],
      }),
      context: { authState: { isAuthenticated: true, user: admin } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await screen.findByText('Cardio')
    await userEvent.click(
      screen.getByRole('button', { name: /désactiver le service/i }),
    )
    await screen.findByText('5')

    await userEvent.click(
      screen.getByRole('button', { name: /confirmer la désactivation/i }),
    )

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'PATCH',
      )
      expect(patchCall).toBeDefined()
      expect(String(patchCall?.[0])).toContain('/admin/services/s1')
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        deactivated: true,
      })
    })
  })

  it('reactiver ne calcule aucun impact : la route dediee n est jamais appelee', async () => {
    const fetchMock = buildFetchMock([
      routeGetServices([serviceDesactive]),
      {
        match: (url, method) =>
          url.endsWith('/admin/services/s2') && method === 'PATCH',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({ ...serviceDesactive, deactivatedAt: null }),
        }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/e/e1/admin/services'],
      }),
      context: { authState: { isAuthenticated: true, user: admin } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await screen.findByText('Neuro')
    await userEvent.click(
      screen.getByRole('button', { name: /réactiver le service/i }),
    )

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'PATCH',
      )
      expect(patchCall).toBeDefined()
    })
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('impact-desactivation'),
      ),
    ).toBe(false)
  })
})

describe('beforeLoad de l ecran des services — garde services:manage', () => {
  const member: User = {
    id: 'u2',
    email: 'membre@b.fr',
    firstName: null,
    lastName: null,
    isSuperAdmin: false,
    establishments: [
      {
        id: 'e1',
        name: 'CHU',
        role: 'MEMBER',
        services: [{ id: 's1', name: 'Cardio', role: 'INTERVENANT' }],
      },
    ],
  }

  const runBeforeLoad = (user: User) => {
    const beforeLoad = optionsDe(servicesRoute).beforeLoad
    return beforeLoad({
      context: { authState: { isAuthenticated: true, user } },
      params: { establishmentId: 'e1' },
    })
  }

  it('laisse passer un administrateur de l etablissement', () => {
    expect(() => runBeforeLoad(admin)).not.toThrow()
  })

  it('refuse un simple membre (role MEMBER)', () => {
    expect(() => runBeforeLoad(member)).toThrow(
      expect.objectContaining({ isRedirect: true, to: '/' }),
    )
  })
})
