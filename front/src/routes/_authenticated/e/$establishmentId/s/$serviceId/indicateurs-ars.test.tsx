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
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AuthState, User } from '@/types/auth.ts'
import { Route as serviceLayoutRoute } from '../$serviceId.tsx'
import { Route as arsRoute } from './indicateurs-ars.tsx'

dayjs.extend(utc)

// Trois états TOUJOURS distincts — chargement, erreur, données — plus le refus de l'écran à qui
// n'a pas `stats:read`. Le tableau vide indiscernable d'une panne a déjà été livré deux fois sur
// ce dépôt (front/CLAUDE.md, § Testing) ; ici la grille a 30 lignes même quand le service n'a
// rien, donc « vide » n'est pas un état de cet écran : c'est précisément pourquoi une panne
// rendue en silence serait indétectable à l'œil.

const optionsDe = (route: AnyRoute) => route.options

const avecRole = (id: string, role: 'COORDINATEUR' | 'INTERVENANT'): User => ({
  id,
  email: `${id}@b.fr`,
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [{ id: 's1', name: 'Cardio', role }],
    },
  ],
})

const coordinateur = avecRole('u1', 'COORDINATEUR')
const intervenant = avecRole('u2', 'INTERVENANT')

const rootRoute = createRootRouteWithContext<{ authState: AuthState }>()({
  component: () => <Outlet />,
})
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '/_authenticated',
  component: () => <Outlet />,
})
const serviceRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'e/$establishmentId/s/$serviceId',
  beforeLoad: optionsDe(serviceLayoutRoute).beforeLoad,
  remountDeps: optionsDe(serviceLayoutRoute).remountDeps,
  component: () => <Outlet />,
})
const dashboardRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'dashboard',
  component: () => <p>Tableau de bord</p>,
})
const arsScreenRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'indicateurs-ars',
  beforeLoad: optionsDe(arsRoute).beforeLoad,
  component: optionsDe(arsRoute).component,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    serviceRoute.addChildren([dashboardRoute, arsScreenRoute]),
  ]),
])

const indicateurs = [
  {
    code: '1.1',
    group: 'Entrée',
    label: "Nombre de patients ayant bénéficié d'un diagnostic éducatif",
    value: 7,
    note: null,
  },
  {
    code: '2.3',
    group: 'Séances',
    label: 'Nombre de patients pris en charge en soins de ville uniquement',
    value: null,
    note: 'Aucune notion de soins de ville',
  },
]

const monter = (
  reponse: { ok: boolean; status: number; corps?: unknown },
  user: User = coordinateur,
) => {
  // Le mock est SÉLECTIF : `DashboardLayout` monte aussi la barre et son panneau de tâches, qui
  // appellent d'autres routes. Une réponse unique pour tout ferait échouer l'écran pour une raison
  // qui n'a rien à voir avec ce qu'on éprouve ici.
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/indicateurs-ars')) {
        return {
          ok: reponse.ok,
          status: reponse.status,
          url,
          json: async () => reponse.corps,
        }
      }
      return { ok: true, status: 200, url, json: async () => [] }
    }),
  )
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/e/e1/s/s1/indicateurs-ars'],
    }),
    context: { authState: { isAuthenticated: true, user } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: coordinateur,
    context: {
      establishmentId: 'e1',
      serviceId: 's1',
      establishmentRole: 'MEMBER',
      serviceRole: 'COORDINATEUR',
      soignantId: null,
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('écran des indicateurs ARS', () => {
  it('affiche les indicateurs rendus par le serveur', async () => {
    monter({
      ok: true,
      status: 200,
      corps: { from: '2026-01-01', to: '2026-12-31', indicators: indicateurs },
    })

    expect(await screen.findByText('7')).toBeInTheDocument()
    expect(
      screen.getByText('Aucune notion de soins de ville'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // Le cas qui compte : une panne du serveur ne doit PAS ressembler à une grille chargée.
  it('annonce une erreur plutot que des tableaux muets quand la lecture echoue', async () => {
    monter({ ok: false, status: 500 })

    const alerte = await screen.findByRole('alert')
    expect(alerte).toHaveTextContent(/Impossible de charger les indicateurs/i)
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument()
  })

  it('desactive l export tant que la lecture n a pas abouti', async () => {
    monter({ ok: false, status: 500 })

    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeDisabled()
  })

  it('renvoie au tableau de bord un role sans stats:read', async () => {
    monter(
      {
        ok: true,
        status: 200,
        corps: { from: '2026-01-01', to: '2026-12-31', indicators: [] },
      },
      intervenant,
    )

    await waitFor(() => {
      expect(screen.getByText('Tableau de bord')).toBeInTheDocument()
    })
    expect(screen.queryByText('Indicateurs ARS')).not.toBeInTheDocument()
  })
})
