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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AuthState, User } from '@/types/auth.ts'

import { Route as adminRoute } from '../admin.tsx'
import { Route as membersRoute } from './members.tsx'

// Même artefact d'environnement que `services.test.tsx` : `ReactTable`
// virtualise ses lignes (`@tanstack/react-virtual`), qui mesure sous jsdom
// un conteneur de taille nulle et ne rend donc aucune ligne. Ce mock local
// rend TOUTES les lignes, pour éprouver le VRAI `members.tsx` sans le
// réécrire.
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

// Important n°4 (tour de correction 1, tâche 13) : `members.tsx` ne lisait
// jamais `error` — sur un 500, `members` restait `undefined` et le tableau
// se contentait d'un rendu vide, indiscernable de « aucun membre » une fois
// le toast disparu. `services.tsx`/`grants.tsx` distinguaient déjà les
// trois états ; ce fichier verrouille le même filet sur l'onglet des
// membres, avec le même style de test (montage des VRAIES options de
// route) que `services.test.tsx`/`grants.test.tsx`.

const optionsDe = (route: AnyRoute) => route.options

const admin: User = {
  id: 'u1',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    { id: 'e1', name: 'CHU', role: 'ADMIN', soignantId: null, services: [] },
  ],
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
const membersScreenRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'members',
  beforeLoad: optionsDe(membersRoute).beforeLoad,
  component: optionsDe(membersRoute).component,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([adminLayoutRoute.addChildren([membersScreenRoute])]),
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
    history: createMemoryHistory({ initialEntries: ['/e/e1/admin/members'] }),
    context: { authState: { isAuthenticated: true, user: admin } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const routeSoignants: Route = {
  match: (url, method) => url.endsWith('/admin/soignant') && method === 'GET',
  respond: () => ({ ok: true, status: 200, json: async () => [] }),
}

const routeServices = (services: unknown[] = []): Route => ({
  match: (url, method) => url.endsWith('/admin/services') && method === 'GET',
  respond: () => ({ ok: true, status: 200, json: async () => services }),
})

const membreActif = {
  id: 'm1',
  role: 'MEMBER' as const,
  soignantId: null,
  user: {
    id: 'u2',
    email: 'membre@chu.fr',
    firstName: 'Un',
    lastName: 'Membre',
    deactivatedAt: null,
  },
  serviceMemberships: [],
}

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: admin, context: null })
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('etats de l ecran des membres', () => {
  it('affiche un etat de chargement tant que la reponse n est pas arrivee', async () => {
    // Une promesse qui ne se regle jamais pour la requete des membres (le
    // stub des soignants, lui, se regle normalement) : la requete des
    // membres reste `isPending` indefiniment.
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).endsWith('/admin/soignant')) {
          return Promise.resolve(new Response('[]', { status: 200 }))
        }
        return new Promise(() => {
          // Ne se regle jamais.
        })
      }),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/e/e1/admin/members'] }),
      context: { authState: { isAuthenticated: true, user: admin } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(await screen.findByText(/chargement/i)).toBeInTheDocument()
    expect(screen.queryByText(/impossible de charger les membres/i)).not.toBeInTheDocument()
  })

  // Le cas qui compte le plus (meme lecon qu'a la tache 12) : sans le
  // filet, un 500 laisse `members` a `undefined`, le tableau se contente
  // d'un rendu vide et rien ne distingue « panne » d' « aucun membre ».
  it("affiche une erreur distincte, jamais un tableau vide silencieux, sur une panne", async () => {
    monter([
      routeSoignants,
      {
        match: (url, method) => url.endsWith('/admin/members') && method === 'GET',
        respond: () => ({ ok: false, status: 500, json: async () => ({}) }),
      },
    ])

    await waitFor(() => {
      expect(screen.getByText(/impossible de charger les membres/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/aucun membre pour le moment/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^chargement/i)).not.toBeInTheDocument()
  })

  it('affiche un etat vide distinct quand la liste est vide', async () => {
    monter([
      routeSoignants,
      {
        match: (url, method) => url.endsWith('/admin/members') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => [] }),
      },
    ])

    await waitFor(() => {
      expect(screen.getByText(/aucun membre pour le moment/i)).toBeInTheDocument()
    })
    expect(
      screen.queryByText(/impossible de charger les membres/i),
    ).not.toBeInTheDocument()
  })

  it('affiche le contenu une fois la reponse arrivee', async () => {
    monter([
      routeSoignants,
      routeServices(),
      {
        match: (url, method) => url.endsWith('/admin/members') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => [membreActif] }),
      },
    ])

    await waitFor(() => {
      expect(screen.getByText('membre@chu.fr')).toBeInTheDocument()
    })
    expect(screen.queryByText(/impossible de charger les membres/i)).not.toBeInTheDocument()
  })

  // Tour de correction 1 (Important n°2) : avant cette tache, la colonne
  // « Role service » ne montrait QUE le role dans un contexte de service qui
  // n'existe jamais sur cet ecran — toujours « — », meme pour un membre
  // reellement affecte. Verrouille le VRAI rendu (virtualiseur simule, sinon
  // vrai par vacuite — voir front/CLAUDE.md, § Testing) : le nom du service
  // ET son role, pour CHAQUE affectation, plus la degradation propre quand
  // le service n'est pas (encore) dans la liste chargee.
  it('affiche le nom du service ET le role pour chaque affectation reelle (multi-service)', async () => {
    const membreAffecte = {
      id: 'm2',
      role: 'MEMBER' as const,
      soignantId: null,
      user: {
        id: 'u3',
        email: 'affecte@chu.fr',
        firstName: null,
        lastName: null,
        deactivatedAt: null,
      },
      serviceMemberships: [
        { serviceId: 'svcA', role: 'COORDINATEUR' as const },
        // Service absent de la liste chargee (course, ou tout autre ecart) :
        // le role reste visible, sans nom de service devant.
        { serviceId: 'svc-disparu', role: 'LECTURE' as const },
      ],
    }
    monter([
      routeSoignants,
      routeServices([
        {
          id: 'svcA',
          name: 'Cardiologie',
          createdAt: '2026-01-01T00:00:00.000Z',
          deactivatedAt: null,
        },
      ]),
      {
        match: (url, method) => url.endsWith('/admin/members') && method === 'GET',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => [membreActif, membreAffecte],
        }),
      },
    ])

    await waitFor(() => {
      expect(screen.getByText('affecte@chu.fr')).toBeInTheDocument()
    })

    expect(screen.getByText('Cardiologie : Coordinateur')).toBeInTheDocument()
    expect(screen.getByText('Lecture')).toBeInTheDocument()
  })

  // Revue finale de l'etape 4a, Important n°3 : « identifiants copiables »
  // (decisions-etape-4a.md, D3/D4) n'etait tenu que pour l'etablissement —
  // le geste de depannage reel (« donne-moi l'identifiant de ce compte »)
  // n'avait nulle part ou se poser sur cet ecran. L'identifiant montre est
  // celui du COMPTE (`member.user.id`), le meme que celui affiche par la
  // recherche de comptes du super-admin (`accountSearchPanel.tsx`).
  it("affiche l'identifiant du compte, copiable", async () => {
    monter([
      routeSoignants,
      routeServices(),
      {
        match: (url, method) => url.endsWith('/admin/members') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => [membreActif] }),
      },
    ])

    await waitFor(() => {
      expect(screen.getByText('membre@chu.fr')).toBeInTheDocument()
    })

    expect(screen.getByText(membreActif.user.id)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copier l'identifiant/i })).toBeInTheDocument()

    // Le membre sans aucune affectation garde son tiret, sur SA propre
    // ligne — jamais confondu avec celles de l'autre membre.
    const ligneMembreActif = screen.getByText('membre@chu.fr').closest('tr')
    expect(ligneMembreActif).not.toBeNull()
    expect(ligneMembreActif?.textContent).toContain('—')
  })
})
