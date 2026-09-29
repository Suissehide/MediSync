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

import type { AuthState, User } from '@/types/auth.ts'
import { Route as indexRoute } from './index.tsx'
import { Route as superAdminIndexRoute } from './super-admin/index.tsx'
import { Route as superAdminLayoutRoute } from './super-admin.tsx'

// ---------------------------------------------------------------------------
// Tour de correction 1, Critique n°1 : « l'écran que tout le chantier existe
// pour servir est inatteignable ». Un compte `isSuperAdmin: true` avec
// `establishments: []` — l'état EXACT que laisse le script d'amorçage de la
// tâche 11, qui ne crée jamais d'appartenance d'établissement — se
// connectait, arrivait sur `/`, et se faisait renvoyer vers `/pending`, un
// écran sans `DashboardLayout` (donc sans barre latérale, donc sans l'entrée
// « Super-administration ») qui lui ment de surcroît (« en attente
// d'approbation », faux pour ce compte).
//
// `index.test.ts` verrouille désormais la CIBLE de la redirection ; ce
// fichier verrouille le PARCOURS COMPLET, de la racine authentifiée jusqu'à
// l'écran réellement rendu — le sens positif que rien, avant ce tour, ne
// parcourait de bout en bout (`index.test.ts` n'avait qu'une fixture
// `sansAcces` avec `isSuperAdmin: false`).
// ---------------------------------------------------------------------------

dayjs.extend(utc)

const superAdminSansEtablissement: User = {
  id: 'sa1',
  email: 'super@medisync.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: true,
  establishments: [],
}

const optionsDe = (route: AnyRoute) => route.options

const rootRoute = createRootRouteWithContext<{ authState: AuthState }>()({
  component: () => <Outlet />,
})

// Reproduit `_authenticated.tsx` : un `beforeLoad` qui se contente de
// renvoyer l'authState reçu en contexte (même simplification que
// `remontage.test.tsx`, qui ne réécrit pas non plus le vrai fichier — celui-ci
// ferait un aller-retour réseau que ce test n'a pas à couvrir).
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '/_authenticated',
  beforeLoad: ({ context }) => ({ authState: context.authState }),
  component: () => <Outlet />,
})

// Le point d'entrée réel : les VRAIES options du fichier (`index.tsx`), pas
// une réimplémentation — un correctif retiré là-bas redevient rouge ici.
const indexRouteDeTest = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/',
  beforeLoad: optionsDe(indexRoute).beforeLoad,
})

// Le layout `/super-admin` réel : sa garde ET son absence de contexte/
// remountDeps sont celles du fichier.
const superAdminLayoutRouteDeTest = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'super-admin',
  beforeLoad: optionsDe(superAdminLayoutRoute).beforeLoad,
  component: optionsDe(superAdminLayoutRoute).component,
})

// L'écran réel de la liste — le même composant que l'application monte.
const superAdminIndexRouteDeTest = createRoute({
  getParentRoute: () => superAdminLayoutRouteDeTest,
  path: '/',
  component: optionsDe(superAdminIndexRoute).component,
})

const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    indexRouteDeTest,
    superAdminLayoutRouteDeTest.addChildren([superAdminIndexRouteDeTest]),
  ]),
])

const monter = (depart: string, user: User) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [depart] }),
    context: { authState: { isAuthenticated: true, user } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.endsWith('/super-admin/establishments')) {
        return Promise.resolve(
          new Response(JSON.stringify([]), { status: 200 }),
        )
      }
      throw new Error(`Appel fetch non attendu dans ce test : ${url}`)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parcours complet : connexion super-admin sans etablissement -> ecran atteint', () => {
  it('arrive reellement sur la liste des etablissements, jamais sur /pending', async () => {
    monter('/', superAdminSansEtablissement)

    // Le symptome exact du defaut : avant le correctif, ce texte n'apparait
    // jamais (le parcours s'arrete sur /pending, "En attente d'approbation").
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Établissements' }),
      ).toBeInTheDocument()
    })

    expect(screen.queryByText(/attente d.approbation/i)).not.toBeInTheDocument()
  })

  // Important n°4 (tour de correction 1) : une erreur de chargement rendait
  // un tableau vide, indiscernable d'un « aucun établissement » réel. Ce
  // test remplace la réponse 200 vide du `beforeEach` par une 500, et
  // exige le message d'erreur — jamais la table vide par défaut.
  it('affiche une erreur distincte quand la liste ne peut pas etre chargee', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 500 }))),
    )

    monter('/', superAdminSansEtablissement)

    await waitFor(() => {
      expect(
        screen.getByText(/impossible de charger les établissements/i),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText(/pas de données/i)).not.toBeInTheDocument()
  })
})
