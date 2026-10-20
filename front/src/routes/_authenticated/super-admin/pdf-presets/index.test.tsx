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
import { Route as listeRoute } from './index.tsx'

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
  path: 'pdf-presets',
  component: optionsDe(listeRoute).component,
})
const editeurRoute = createRoute({
  getParentRoute: () => superAdminRoute,
  path: 'pdf-presets/$presetId',
  component: () => <p>Éditeur</p>,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    superAdminRoute.addChildren([ecranRoute, editeurRoute]),
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
          id: 'titre',
          kind: 'rect',
          x: 10,
          y: 20,
          w: 100,
          h: 30,
          rotation: 0,
          fill: '#e05a5a',
          radius: 0,
        },
      ],
    },
  ],
})

const preset = (
  id: string,
  name: string,
  sortOrder: number,
  isDraft = false,
) => ({
  isDraft,
  id,
  name,
  content: contenu(),
  sortOrder,
})

// `delaiEcriture` tient la fenetre d'envoi ouverte : avec un mock instantane, `isPending`
// est deja retombe quand on observe, et le test serait vrai par vacuite.
const monter = (
  actifs = [preset('p-a', 'Alpha', 0), preset('p-b', 'Beta', 1)],
  delaiEcriture = 0,
) => {
  const ecritures: { url: string; method: string; body: unknown }[] = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      ecritures.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      const reponse = { ok: true, status: 204, url, json: async () => null }
      return delaiEcriture > 0
        ? new Promise((r) => setTimeout(() => r(reponse), delaiEcriture))
        : reponse
    }
    const archived = url.includes('archived=true')
    return {
      ok: true,
      status: 200,
      url,
      json: async () => (archived ? [preset('p-vieux', 'Retiré', 9)] : actifs),
    }
  })
  vi.stubGlobal('fetch', fetchMock)

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/super-admin/pdf-presets'],
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
  return { ecritures }
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  useAuthStore.setState({
    isAuthenticated: true,
    user: superAdmin,
    // AUCUN CONTEXTE DE TENANT : le super-admin n'en a pas. Si l'ecran passait par une API
    // de tenant, elle leverait — et c'est ce que ce harnais est la pour attraper.
    context: null,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Les actions secondaires d'une carte vivent dans son menu « … » : une seule action
// principale par carte, le reste a un clic de plus.
const ouvrirMenu = async (nom: string) =>
  userEvent.click(
    await screen.findByRole('button', { name: `Actions sur ${nom}` }),
  )

describe('liste des modeles livres', () => {
  it('liste les modeles avec leur vignette', async () => {
    monter()

    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    // La vignette passe par le meme moteur que la toile : son element doit y etre.
    expect(screen.getAllByTestId('apercu-element-titre').length).toBe(2)
  })

  it('ouvre l editeur d un modele', async () => {
    monter()

    const boutons = await screen.findAllByRole('button', { name: /Modifier/ })
    await userEvent.click(boutons[0])

    expect(await screen.findByText('Éditeur')).toBeInTheDocument()
  })

  it('cree un modele vierge', async () => {
    const { ecritures } = monter()

    await userEvent.click(
      await screen.findByRole('button', { name: /page blanche/ }),
    )

    await waitFor(() => {
      expect(ecritures).toContainEqual(
        expect.objectContaining({ method: 'POST', body: {} }),
      )
    })
  })

  // Un modele neuf est un brouillon : la carte le dit, et son menu propose de le terminer.
  // Tant qu'il l'est, aucun service ne le voit — c'est le back qui le tient.
  it('marque un brouillon et le termine depuis son menu', async () => {
    const { ecritures } = monter([preset('p-a', 'Alpha', 0, true)])
    await screen.findByText('Alpha')
    expect(screen.getByText('Brouillon')).toBeInTheDocument()

    await ouvrirMenu('Alpha')
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Terminer' }),
    )

    await waitFor(() => {
      expect(ecritures).toContainEqual(
        expect.objectContaining({ method: 'PATCH', body: { isDraft: false } }),
      )
    })
  })

  it('duplique un modele', async () => {
    const { ecritures } = monter()

    await ouvrirMenu('Alpha')
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Dupliquer' }),
    )

    await waitFor(() => {
      expect(ecritures).toContainEqual(
        expect.objectContaining({
          method: 'POST',
          body: { sourcePresetId: 'p-a' },
        }),
      )
    })
  })

  it('montre les modeles supprimes et les restaure', async () => {
    const { ecritures } = monter()
    await screen.findByText('Alpha')

    await userEvent.click(screen.getByRole('radio', { name: /Supprimés/ }))

    await userEvent.click(
      await screen.findByRole('button', { name: /Restaurer/ }),
    )
    await waitFor(() => {
      expect(ecritures).toContainEqual(
        expect.objectContaining({
          method: 'PATCH',
          body: { archived: false },
        }),
      )
    })
  })

  // TROUVE A L'ECRAN : la carte rendait un bouton « Renommer » sans geste derriere — un
  // bouton mort, qui ne disait pas pourquoi il ne faisait rien. Un modele duplique s'appelle
  // « (copie) » ; sans renommage, c'est le seul nom qu'il pourra jamais porter.
  it('renomme un modele', async () => {
    const { ecritures } = monter()

    await ouvrirMenu('Alpha')
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Renommer' }),
    )

    const champ = await screen.findByLabelText(/Nom du mod/)
    await userEvent.clear(champ)
    await userEvent.type(champ, 'Programme cardio')
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    await waitFor(() => {
      expect(ecritures).toContainEqual(
        expect.objectContaining({
          method: 'PATCH',
          body: { name: 'Programme cardio' },
        }),
      )
    })
  })

  // Les fleches envoient la liste ENTIERE, dans le nouvel ordre : le back refuse tout ce qui
  // ne decrit pas exactement l'ensemble existant, et un delta le laisserait deviner.
  it('reordonne par les fleches, en envoyant la liste entiere', async () => {
    const { ecritures } = monter()

    await userEvent.click(await screen.findByLabelText('Monter Beta'))

    await waitFor(() => {
      expect(ecritures).toContainEqual(
        expect.objectContaining({
          method: 'PUT',
          body: { ids: ['p-b', 'p-a'] },
        }),
      )
    })
  })

  // Deux clics rapides : le second lit une liste encore PERIMEE (pas de mise a jour
  // optimiste, l'invalidation n'a pas encore rendu), recalcule le meme deplacement, et
  // l'ordre obtenu n'est pas celui demande. Les fleches se desarment pendant l'envoi.
  it('desarme les fleches pendant un reordonnancement en vol', async () => {
    monter(undefined, 3000)

    await userEvent.click(await screen.findByLabelText('Monter Beta'))

    await waitFor(() => {
      expect(screen.getByLabelText('Descendre Alpha')).toBeDisabled()
    })
  })

  // Sans cette garde, un clic sur la fleche impossible partirait au reseau pour ne rien
  // changer — et le back, lui, accepterait la liste inchangee sans rien dire.
  it('desactive la fleche impossible aux extremites', async () => {
    monter()

    expect(await screen.findByLabelText('Monter Alpha')).toBeDisabled()
    expect(screen.getByLabelText('Descendre Beta')).toBeDisabled()
    expect(screen.getByLabelText('Monter Beta')).toBeEnabled()
  })
})
