import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AuthState, User } from '@/types/auth.ts'

import Sidebar from './sidebar.tsx'

// ---------------------------------------------------------------------------
// Navigation par echelle (2026-09-28) : l'entree vers la plateforme a quitte le menu du compte
// pour le selecteur d'echelle (`scaleSelector.tsx`), ou `scaleSelector.test.tsx` verrouille les
// deux sens (absente sans le drapeau `isSuperAdmin`, presente avec). Le menu du compte ne porte
// plus que Reglages et Deconnexion, pour tous les comptes.
// ---------------------------------------------------------------------------
const compteOrdinaire: User = {
  id: 'u1',
  email: 'a@b.fr',
  firstName: 'Alice',
  lastName: 'Martin',
  isSuperAdmin: false,
  establishments: [],
}

const superAdmin: User = {
  ...compteOrdinaire,
  id: 'sa1',
  email: 'super@medisync.fr',
  isSuperAdmin: true,
}

const monterSidebar = (user: User) => {
  const rootRoute = createRootRouteWithContext<{ authState: AuthState }>()({
    component: () => (
      <Sidebar components={[]} isVisible={true} />
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { authState: { isAuthenticated: true, user } },
  })
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('menu du compte', () => {
  it.each([
    ['un compte ordinaire', compteOrdinaire],
    ['un super-admin', superAdmin],
  ])("ne porte plus d'entree Super-administration pour %s", async (_, user) => {
    monterSidebar(user)

    await userEvent.click(screen.getByRole('button', { name: 'Menu du compte' }))

    expect(screen.getByText('Réglages')).toBeInTheDocument()
    expect(screen.getByText('Déconnecter')).toBeInTheDocument()
    expect(screen.queryByText('Super-administration')).not.toBeInTheDocument()
  })
})
