import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { BasculePilotage } from './basculePilotage.tsx'

// Routeur minimal aux deux formes reelles, params e1/s1 : la bascule lit ses parametres sur
// la route (`useParams({ strict: false })`), comme `journalActivite.tsx`.
const monter = (depart: string, actif: 'activite' | 'ars') => {
  const rootRoute = createRootRoute({
    component: () => <BasculePilotage actif={actif} />,
  })
  const enfants = [
    '/e/$establishmentId/s/$serviceId/activite',
    '/e/$establishmentId/s/$serviceId/indicateurs-ars',
  ].map((path) => createRoute({ getParentRoute: () => rootRoute, path }))
  const router = createRouter({
    routeTree: rootRoute.addChildren(enfants),
    history: createMemoryHistory({ initialEntries: [depart] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('BasculePilotage', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: null })
  })

  it('rend les deux segments pour qui a stats:read, avec le bon segment actif', async () => {
    useAuthStore.setState({
      context: {
        establishmentId: 'e1',
        serviceId: 's1',
        establishmentRole: 'MEMBER',
        serviceRole: 'COORDINATEUR',
        soignantId: null,
      },
    })
    monter('/e/e1/s/s1/indicateurs-ars', 'ars')

    const activite = await screen.findByRole('link', { name: 'Activité' })
    const ars = screen.getByRole('link', { name: 'Indicateurs ARS' })
    expect(activite).toHaveAttribute('href', '/e/e1/s/s1/activite')
    expect(ars).toHaveAttribute('href', '/e/e1/s/s1/indicateurs-ars')
    expect(ars).toHaveAttribute('aria-current', 'page')
    expect(activite).not.toHaveAttribute('aria-current')
  })

  it('ne rend rien pour qui n a pas stats:read (LECTURE) : pas de bascule a un seul segment', () => {
    useAuthStore.setState({
      context: {
        establishmentId: 'e1',
        serviceId: 's1',
        establishmentRole: 'MEMBER',
        serviceRole: 'LECTURE',
        soignantId: null,
      },
    })
    monter('/e/e1/s/s1/activite', 'activite')

    expect(screen.queryByText('Activité')).not.toBeInTheDocument()
    expect(screen.queryByText('Indicateurs ARS')).not.toBeInTheDocument()
  })
})
