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
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuthState, User } from '@/types/auth.ts'
import { Route as detailRoute } from './$establishmentId.tsx'

// ---------------------------------------------------------------------------
// « il n'existe aucun fichier de test pour cette
// route ». Le code de `$establishmentId.tsx` distingue bien trois états
// (chargement/erreur/vide-ou-prêt via `libs/queryState.ts`), mais rien ne
// garde cette distinction dans le temps — un `isPending || !establishment`
// réintroduit un jour donnerait de nouveau un « Chargement… » perpétuel
// devant une vraie erreur (identifiant supprimé ou mal recopié), sans
// qu'aucun test ne le remarque. Ce fichier verrouille les trois états, en
// montant les VRAIES options du fichier de route (même convention que
// `remontage.test.tsx` et `super-admin-journey.test.tsx`) : un correctif
// retiré là-bas redevient rouge ici.
// ---------------------------------------------------------------------------

dayjs.extend(utc)

const superAdmin: User = {
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

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '/_authenticated',
  component: () => <Outlet />,
})

// Les VRAIES options du fichier : un correctif retiré de `$establishmentId.tsx`
// redevient rouge ici, pas seulement dans une réimplémentation locale.
const detailRouteDeTest = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'super-admin/$establishmentId',
  component: optionsDe(detailRoute).component,
})

const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([detailRouteDeTest]),
])

const monter = (fetchImpl: (url: string) => Promise<Response> | never) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => fetchImpl(input.toString())),
  )
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/super-admin/e1'] }),
    context: { authState: { isAuthenticated: true, user: superAdmin } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const etablissementComplet = {
  id: 'e1',
  name: 'CHU',
  createdAt: '2025-01-01T00:00:00.000Z',
  deactivatedAt: null,
  serviceCount: 0,
  accountCount: 0,
  patientCount: 0,
  firstAdmin: null,
  lastActivityAt: null,
  services: [],
  members: [],
  activityLog: [],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('etats de l ecran de detail d etablissement', () => {
  it('affiche un etat de chargement tant que la reponse n est pas arrivee', async () => {
    // Une promesse qui ne se règle jamais : la requête reste `isPending`
    // indéfiniment, exactement l'état que ce cas vérifie.
    monter(
      () =>
        new Promise<Response>(() => {
          // Ne se règle jamais : la requête reste `isPending` indéfiniment.
        }),
    )

    expect(await screen.findByText(/chargement/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/impossible de charger cet établissement/i),
    ).not.toBeInTheDocument()
  })

  // LE CAS QUI COMPTE LE PLUS : c'est lui qui
  // donnait un « Chargement… » perpétuel sur un identifiant supprimé ou mal
  // recopié — le geste même que cet écran sert.
  it("affiche une erreur distincte, jamais un chargement perpetuel, quand l'etablissement ne peut pas etre charge", async () => {
    monter(() => Promise.resolve(new Response(null, { status: 404 })))

    await waitFor(() => {
      expect(
        screen.getByText(/impossible de charger cet établissement/i),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText(/^chargement/i)).not.toBeInTheDocument()

    // Le bouton de retour reste offert : une erreur ne doit jamais être une
    // impasse.
    expect(
      screen.getByRole('button', { name: /retour à la liste/i }),
    ).toBeInTheDocument()
  })

  // L'état "vide" : un succès HTTP sans le corps attendu (`null`), que
  // `queryState` traite comme `hasData: false` — le même filet de sécurité
  // que l'erreur (`!establishment`) l'attrape aussi, et affiche le même
  // message plutôt que de laisser passer un rendu qui déréférencerait un
  // établissement absent.
  it("affiche le meme etat d'erreur qu'une panne quand la reponse est un succes sans donnee", async () => {
    monter(() => Promise.resolve(new Response('null', { status: 200 })))

    await waitFor(() => {
      expect(
        screen.getByText(/impossible de charger cet établissement/i),
      ).toBeInTheDocument()
    })
  })

  it("affiche le contenu de l'etablissement une fois la reponse arrivee", async () => {
    monter(() =>
      Promise.resolve(
        new Response(JSON.stringify(etablissementComplet), { status: 200 }),
      ),
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'CHU' })).toBeInTheDocument()
    })
    expect(
      screen.queryByText(/impossible de charger cet établissement/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/chargement/i)).not.toBeInTheDocument()
  })
})
