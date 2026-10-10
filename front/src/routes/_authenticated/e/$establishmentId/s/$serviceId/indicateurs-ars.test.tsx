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
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AuthState, User } from '@/types/auth.ts'
import { Route as serviceLayoutRoute } from '../$serviceId.tsx'
import { Route as ancienneRoute } from './indicateurs-ars.tsx'

// L'ancienne adresse de la grille ARS : les favoris menent au jeu « Grille ARS », ou a l'Activite
// pour un service qui n'en a pas (Review Focus 3).

const optionsDe = (route: AnyRoute) => route.options

const coordinateur: User = {
  id: 'u1',
  email: 'u1@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [{ id: 's1', name: 'Cardio', role: 'COORDINATEUR' }],
    },
  ],
}

const rootRoute = createRootRouteWithContext<{ authState: AuthState }>()({
  component: () => <Outlet />,
})
const serviceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'e/$establishmentId/s/$serviceId',
  beforeLoad: optionsDe(serviceLayoutRoute).beforeLoad,
  remountDeps: optionsDe(serviceLayoutRoute).remountDeps,
  component: () => <Outlet />,
})
const ancienne = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'indicateurs-ars',
  beforeLoad: optionsDe(ancienneRoute).beforeLoad,
  component: optionsDe(ancienneRoute).component,
})
const jeu = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'indicateurs/$setId',
  component: () => <p>{`Jeu ${jeu.useParams().setId}`}</p>,
})
const activite = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'activite',
  component: () => <p>Activité du service</p>,
})
const routeTree = rootRoute.addChildren([
  serviceRoute.addChildren([ancienne, jeu, activite]),
])

const monter = (jeux: unknown[]) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      url: input.toString(),
      json: async () => jeux,
    })),
  )
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/e/e1/s/s1/indicateurs-ars'],
    }),
    context: { authState: { isAuthenticated: true, user: coordinateur } },
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: coordinateur })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ancienne adresse des indicateurs ARS', () => {
  it('mene au jeu « Grille ARS » du service', async () => {
    const router = monter([
      { id: 'autre', name: 'Qualité', order: 0, archived: false },
      { id: 'ars', name: 'Grille ARS', order: 1, archived: false },
    ])

    expect(await screen.findByText('Jeu ars')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/e/e1/s/s1/indicateurs/ars')
  })

  it('mene a l Activite quand le service n a pas de grille ARS', async () => {
    const router = monter([
      { id: 'autre', name: 'Qualité', order: 0, archived: false },
    ])

    expect(await screen.findByText('Activité du service')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/e/e1/s/s1/activite')
  })

  it('mene a l Activite quand la grille ARS est archivee', async () => {
    monter([{ id: 'ars', name: 'Grille ARS', order: 0, archived: true }])

    expect(await screen.findByText('Activité du service')).toBeInTheDocument()
  })
})
