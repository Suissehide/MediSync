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

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { AuthState, User } from '@/types/auth.ts'
import type { PdfDesignContent } from '@/types/pdfDesign.ts'
import { Route as layoutRoute } from '../../super-admin.tsx'
import { Route as editeurRoute } from './$presetId.tsx'

const optionsDe = (route: AnyRoute) => route.options

const superAdmin: User = {
  id: 'u1',
  email: 'super@medisync.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: true,
  establishments: [],
}

const rootRoute = createRootRouteWithContext<{ authState: AuthState }>()({
  component: () => <Outlet />,
})
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '/_authenticated',
  component: () => <Outlet />,
})
const superAdminRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'super-admin',
  beforeLoad: optionsDe(layoutRoute).beforeLoad,
  component: () => <Outlet />,
})
const ecranRoute = createRoute({
  getParentRoute: () => superAdminRoute,
  path: 'pdf-presets/$presetId',
  component: optionsDe(editeurRoute).component,
})
const listeRoute = createRoute({
  getParentRoute: () => superAdminRoute,
  path: 'pdf-presets',
  component: () => <p>Liste des modèles</p>,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    superAdminRoute.addChildren([ecranRoute, listeRoute]),
  ]),
])

const contenu = (): PdfDesignContent => ({
  version: 1,
  pages: [
    {
      kind: 'canvas',
      id: 'p1',
      background: '#ffffff',
      elements: [
        {
          id: 'logo',
          kind: 'image',
          x: 10,
          y: 20,
          w: 100,
          h: 60,
          rotation: 0,
          source: { builtin: 'logo-chu' },
          fit: 'contain',
        },
      ],
    },
  ],
})

const monter = () => {
  const ecritures: { method: string; body: unknown }[] = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      ecritures.push({
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return { ok: true, status: 200, url, json: async () => null }
    }
    return {
      ok: true,
      status: 200,
      url,
      json: async () => [
        {
          id: 'p-a',
          name: 'Programme de référence',
          content: contenu(),
          sortOrder: 0,
        },
      ],
    }
  })
  vi.stubGlobal('fetch', fetchMock)

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/super-admin/pdf-presets/p-a'],
    }),
    context: { authState: { isAuthenticated: true, user: superAdmin } },
  })
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ecritures, fetchMock }
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  useAuthStore.setState({
    isAuthenticated: true,
    user: superAdmin,
    context: null,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('editeur d un modele livre', () => {
  it('monte l editeur sur le modele', async () => {
    monter()

    expect(
      await screen.findByText('Programme de référence'),
    ).toBeInTheDocument()
    // La toile rend bien l'element du contenu — c'est le meme moteur que l'ecran de service.
    expect(await screen.findByTestId('element-logo')).toBeInTheDocument()
  })

  // Un modele livre n'utilise que les images de l'application : la spec exclut une table
  // d'images globale. Afficher un champ de depot promettrait une image qui ne pourrait
  // jamais y etre posee, et proposer celles d'un service n'aurait aucun sens hors tenant.
  it('ne propose ni la liste des images du service ni le depot', async () => {
    monter()

    await userEvent.click(await screen.findByTestId('poignee-deplacement-logo'))

    expect(screen.queryByLabelText(/Déposer une image/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Image'))
    expect(
      await screen.findByRole('option', { name: 'Logo' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Lignes' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  // Aucune requete d'images ne doit partir : un modele n'en a pas, et en demander ouvrirait
  // une route de tenant depuis un ecran qui n'a pas de tenant.
  it('ne demande aucune image de service', async () => {
    const { fetchMock } = monter()
    await screen.findByText('Programme de référence')

    const appels = fetchMock.mock.calls.map(([url]) => String(url))
    expect(appels.some((url) => url.includes('/pdf-assets'))).toBe(false)
  })

  it('enregistre le contenu du modele', async () => {
    const { ecritures } = monter()
    await screen.findByTestId('element-logo')

    await userEvent.click(screen.getByRole('button', { name: /Texte/ }))
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    await waitFor(() => {
      expect(ecritures).toContainEqual(
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
  })

  it('revient a la liste', async () => {
    monter()

    await userEvent.click(await screen.findByRole('button', { name: /Retour/ }))

    expect(await screen.findByText('Liste des modèles')).toBeInTheDocument()
  })
})
