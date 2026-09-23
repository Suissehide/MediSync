import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'

import { TenantSelector } from './tenantSelector.tsx'

const userAvecUnCouple: User = {
  id: 'u1',
  email: 'a@b.fr',
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

const userAvecTroisCouples: User = {
  id: 'u2',
  email: 'b@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      soignantId: 'so1',
      services: [
        { id: 's1', name: 'Cardio', role: 'INTERVENANT' },
        { id: 's2', name: 'Pneumo', role: 'INTERVENANT' },
      ],
    },
    {
      id: 'e2',
      name: 'Clinique du Parc',
      role: 'MEMBER',
      soignantId: 'so2',
      services: [{ id: 's3', name: 'Cardio', role: 'INTERVENANT' }],
    },
  ],
}

// Routeur minimal, sans arbre de routes reel : `TenantSelector` n'a besoin
// que d'un `useRouter()` fonctionnel (pour `router.navigate` au clic, jamais
// declenche par ces deux tests, qui ne verifient que le rendu).
const renderTenantSelector = () => {
  const rootRoute = createRootRoute({ component: TenantSelector })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('TenantSelector', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: null })
  })

  it('ne rend rien pour un utilisateur a un seul couple accessible', () => {
    useAuthStore.setState({ user: userAvecUnCouple })

    const { container } = renderTenantSelector()

    expect(screen.queryByLabelText('Changer de service')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('rend autant d entrees que de couples accessibles pour un utilisateur qui en a trois', async () => {
    useAuthStore.setState({ user: userAvecTroisCouples })

    renderTenantSelector()

    const trigger = await screen.findByLabelText('Changer de service')
    await userEvent.click(trigger)

    const entries = await screen.findAllByRole('button', { name: /Cardio|Pneumo/ })
    // Le bouton d'ouverture porte aussi un texte « Choisir un service » qui
    // ne correspond a aucune entree ; seules les trois options du menu
    // matchent le nom d'un service.
    expect(entries).toHaveLength(3)
  })
})
