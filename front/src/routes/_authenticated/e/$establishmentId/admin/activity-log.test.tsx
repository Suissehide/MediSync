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
import { Route as journalRoute } from './activity-log.tsx'

// Pagination et recherche cote serveur du journal d'activite (2026-09-29). L'ecran n'a plus
// le droit de filtrer ou de paginer lui-meme : il transmet la page, la taille et le nom cherche,
// et affiche le total rendu par le serveur.

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
const journalScreenRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'activity-log',
  beforeLoad: optionsDe(journalRoute).beforeLoad,
  component: optionsDe(journalRoute).component,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([adminLayoutRoute.addChildren([journalScreenRoute])]),
])

// Une ligne par page demandee, pour reconnaitre la page affichee ; 120 lignes au total.
const ligne = (page: number) => ({
  id: `l${page}`,
  userID: 'u9',
  userFirstName: 'Camille',
  userLastName: `Page${page}`,
  serviceId: null,
  action: 'thematic.created',
  entityType: 'thematic',
  entityID: `t${page}`,
  createdAt: '2026-09-01T10:00:00.000Z',
})

let requetesJournal: URL[] = []

const monter = () => {
  requetesJournal = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = new URL(input.toString(), 'http://localhost')
      if (url.pathname.endsWith('/activity-log')) {
        requetesJournal.push(url)
        const page = Number(url.searchParams.get('page') ?? 1)
        const pageSize = Number(url.searchParams.get('pageSize') ?? 50)
        return Promise.resolve(
          Response.json({ data: [ligne(page)], total: 120, page, pageSize }),
        )
      }
      return Promise.resolve(Response.json([]))
    }),
  )
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/e/e1/admin/activity-log'] }),
    context: { authState: { isAuthenticated: true, user: admin } },
  })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const derniereRequete = () => requetesJournal.at(-1)?.searchParams

// Le corps de la table est virtualise : sans hauteur dans jsdom, aucune ligne n'y est rendue. Ces
// tests observent donc ce qui compte ici — les requetes envoyees et le pied de pagination.
const piedCharge = () => screen.findByText('120 résultats', {}, { timeout: 3000 })

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: admin, context: null })
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('journal d activite : pagination et recherche cote serveur', () => {
  it('demande la premiere page et affiche le total du serveur, pas la taille de la page recue', async () => {
    monter()

    expect(await piedCharge()).toBeInTheDocument()
    expect(derniereRequete()?.get('page')).toBe('1')
    expect(derniereRequete()?.get('pageSize')).toBe('25')
    // 120 lignes en pages de 25 : la derniere page proposee est la 5e.
    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '6' })).not.toBeInTheDocument()
  })

  it('demande au serveur la page choisie', async () => {
    monter()
    await piedCharge()

    await userEvent.click(screen.getByRole('button', { name: '3' }))

    await waitFor(() => {
      expect(derniereRequete()?.get('page')).toBe('3')
    })
  })

  it('envoie la recherche d auteur au serveur, et revient a la premiere page', async () => {
    monter()
    await piedCharge()
    await userEvent.click(screen.getByRole('button', { name: '3' }))
    await waitFor(() => {
      expect(derniereRequete()?.get('page')).toBe('3')
    })

    await userEvent.type(screen.getByPlaceholderText('Rechercher un utilisateur...'), 'Durand')

    await waitFor(() => {
      expect(derniereRequete()?.get('user')).toBe('Durand')
    })
    expect(derniereRequete()?.get('page')).toBe('1')
    // Une requete pour la recherche complete, pas une par frappe.
    expect(requetesJournal.filter((u) => u.searchParams.has('user'))).toHaveLength(1)
  })
})
