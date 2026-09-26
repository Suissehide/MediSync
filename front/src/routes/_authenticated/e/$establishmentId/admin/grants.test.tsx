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

import { Route as adminRoute } from '../admin.tsx'
import { Route as grantsRoute } from './grants.tsx'

// Onglet des accès temporaires (tâche 13, step 2). `GET
// /e/:establishmentId/admin/grants` : délibérément asymétrique avec le
// super-admin (arbitrage transmis par Léo) — vérifié ici en observant
// simplement que cette route établissement suffit à afficher les deux
// groupes, en cours et passés, avec motif et auteur.

dayjs.extend(utc)

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
const grantsScreenRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'grants',
  beforeLoad: optionsDe(grantsRoute).beforeLoad,
  component: optionsDe(grantsRoute).component,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([adminLayoutRoute.addChildren([grantsScreenRoute])]),
])

const monter = (fetchImpl: (url: string, method: string) => Promise<Response> | never) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      fetchImpl(input.toString(), init?.method ?? 'GET'),
    ),
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/e/e1/admin/grants'] }),
    context: { authState: { isAuthenticated: true, user: admin } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const grantedBy = {
  id: 'sa1',
  email: 'super@medisync.fr',
  firstName: 'Ada',
  lastName: 'Min',
}

const grantEnCours = {
  id: 'g1',
  reason: 'Panne du compte administrateur',
  grantedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  revokedAt: null,
  grantedBy,
}
const grantExpire = {
  id: 'g2',
  reason: 'Astreinte week-end',
  grantedAt: '2020-01-01T00:00:00.000Z',
  expiresAt: '2020-01-02T00:00:00.000Z',
  revokedAt: null,
  grantedBy,
}
const grantRevoque = {
  id: 'g3',
  reason: 'Erreur de saisie',
  grantedAt: '2021-01-01T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  revokedAt: '2021-01-01T01:00:00.000Z',
  grantedBy,
}

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: admin, context: null })
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('etats de l ecran des acces temporaires', () => {
  it('affiche un etat de chargement tant que la reponse n est pas arrivee', async () => {
    monter(() => new Promise<Response>(() => undefined))

    expect(await screen.findByText(/chargement/i)).toBeInTheDocument()
  })

  it('affiche une erreur distincte, jamais un chargement perpetuel, sur une panne', async () => {
    monter(() => Promise.resolve(new Response(null, { status: 500 })))

    await waitFor(() => {
      expect(screen.getByText(/impossible de charger les accès temporaires/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/^chargement/i)).not.toBeInTheDocument()
  })

  it('affiche un etat vide distinct sur les deux groupes quand il n y a aucun acces', async () => {
    monter(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 })))

    await waitFor(() => {
      expect(screen.getByText(/aucun accès en cours/i)).toBeInTheDocument()
      expect(screen.getByText(/aucun accès passé/i)).toBeInTheDocument()
    })
  })

  it("separe correctement en cours (ni revoque ni expire) et passes (revoques ou expires), avec motif et auteur", async () => {
    monter(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([grantEnCours, grantExpire, grantRevoque]),
          { status: 200 },
        ),
      ),
    )

    await screen.findByText('Panne du compte administrateur')

    const enCoursSection = screen.getByText(/^en cours$/i).closest('section')
    const passesSection = screen.getByText(/^passés$/i).closest('section')
    expect(enCoursSection).not.toBeNull()
    expect(passesSection).not.toBeNull()

    // Motif + auteur pour l'accès en cours, dans la bonne section.
    expect(enCoursSection).toHaveTextContent('Panne du compte administrateur')
    expect(enCoursSection).toHaveTextContent('Ada Min')
    expect(enCoursSection).not.toHaveTextContent('Astreinte week-end')
    expect(enCoursSection).not.toHaveTextContent('Erreur de saisie')

    // Les deux accès passés (l'un expiré, l'autre révoqué) sont dans
    // l'AUTRE section, jamais dans « en cours ».
    expect(passesSection).toHaveTextContent('Astreinte week-end')
    expect(passesSection).toHaveTextContent('Erreur de saisie')
    expect(passesSection).not.toHaveTextContent('Panne du compte administrateur')
  })
})

describe('beforeLoad de l ecran des acces temporaires — garde members:manage', () => {
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
        soignantId: 'so1',
        services: [{ id: 's1', name: 'Cardio', role: 'INTERVENANT' }],
      },
    ],
  }

  const runBeforeLoad = (user: User) => {
    const beforeLoad = optionsDe(grantsRoute).beforeLoad
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
