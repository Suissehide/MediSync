import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'
import { useLogout } from './useAuth.ts'

// ---------------------------------------------------------------------------
// « les données survivent à un
// changement de compte ». `useTenantQueryClient` (`hooks/useTenantSwitch.ts`)
// ne construit un client neuf QUE si `tenantKey(context)` change ; ce couple
// vaut la chaîne vide pour TOUT compte qui n'a jamais posé de contexte de
// tenant (`context === null`) — le cas de deux super-admins qui se
// succèdent sans qu'aucun des deux ne visite jamais un écran de tenant. Le
// même client, donc le même cache, survit alors à la déconnexion de A et à
// la connexion de B. `useLogout` doit vider le cache ACTIF (celui que
// `QueryClientProvider` lui fournit au moment de l'appel) : c'est la garantie
// documentée dans `queries/useSuperAdmin.ts`.
// ---------------------------------------------------------------------------

const utilisateur: User = {
  id: 'sa1',
  email: 'super@medisync.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: true,
  establishments: [],
}

const LogoutButton = () => {
  const { logoutMutation } = useLogout()
  return (
    <button type="button" onClick={() => logoutMutation()}>
      Se déconnecter
    </button>
  )
}

const monter = (queryClient: QueryClient) => {
  const rootRoute = createRootRoute({ component: () => <LogoutButton /> })
  const authRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth',
    component: () => <div>Page de connexion</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([authRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: utilisateur,
    context: null,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 200 })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.setState({ isAuthenticated: false, user: null, context: null })
})

describe('useLogout vide le cache de requetes actif', () => {
  it('efface toute donnee mise en cache par le compte qui se deconnecte', async () => {
    const queryClient = new QueryClient()
    // Simule ce qu'un compte super-admin sans etablissement (context: null,
    // voir plus haut) aurait laisse dans le cache — la liste des
    // etablissements, par exemple.
    queryClient.setQueryData(['donnee_du_compte_precedent'], {
      sensible: true,
    })
    expect(queryClient.getQueryCache().getAll()).not.toEqual([])

    monter(queryClient)

    await userEvent.click(
      screen.getByRole('button', { name: /deconnecter|déconnecter/i }),
    )

    await waitFor(() => {
      expect(queryClient.getQueryCache().getAll()).toEqual([])
    })
  })
})
