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
// Étape 4a, tâche 12, step 4 : « un compte sans le drapeau ne voit AUCUNE
// entrée de navigation vers ces écrans ». Le back rend 404 (jamais 403) à qui
// n'a pas `isSuperAdmin` — un menu grisé ou un message « réservé aux
// super-administrateurs » défait ce parti pris (task-12-brief.md). Ce bloc
// verrouille donc les DEUX sens : l'entrée « Super-administration » n'existe
// tout simplement pas dans le DOM pour un compte ordinaire, et elle est bien
// présente pour un compte qui porte le drapeau.
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

describe('entree de navigation Super-administration', () => {
  // Tour de correction 1, Mineur : le bouton porte desormais un
  // `aria-label` explicite (`sidebar.tsx`) — cibler par nom accessible vide
  // cassait pour une raison sans rapport des qu'un second bouton sans nom
  // apparaissait ailleurs dans l'arbre.
  it("n'apparait pas dans le menu du compte pour un compte sans le drapeau isSuperAdmin", async () => {
    monterSidebar(compteOrdinaire)

    await userEvent.click(screen.getByRole('button', { name: 'Menu du compte' }))

    expect(screen.getByText('Réglages')).toBeInTheDocument()
    expect(screen.queryByText('Super-administration')).not.toBeInTheDocument()
  })

  it('apparait dans le menu du compte pour un compte avec le drapeau isSuperAdmin', async () => {
    monterSidebar(superAdmin)

    await userEvent.click(screen.getByRole('button', { name: 'Menu du compte' }))

    expect(await screen.findByText('Super-administration')).toBeInTheDocument()
  })
})
