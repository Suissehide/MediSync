import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'

import { ScaleSelector } from './scaleSelector.tsx'

const base: Omit<User, 'establishments'> = {
  id: 'u1',
  email: 'a@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
}

const intervenantUnService: User = {
  ...base,
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

const troisCouples: User = {
  ...base,
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

const adminCoordinateur: User = {
  ...base,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'ADMIN',
      soignantId: null,
      services: [{ id: 's1', name: 'Cardio', role: 'COORDINATEUR' }],
    },
  ],
}

// Routeur minimal : quelques chemins aux formes des trois echelles, pour que le libelle, lu sur
// la route, ait de quoi se resoudre. Aucune navigation n'est declenchee par ces tests.
const monter = (depart = '/') => {
  const rootRoute = createRootRoute({ component: ScaleSelector })
  const enfants = [
    '/e/$establishmentId/s/$serviceId/dashboard',
    '/e/$establishmentId/admin/members',
    '/super-admin/users',
  ].map((path) => createRoute({ getParentRoute: () => rootRoute, path }))
  const router = createRouter({
    routeTree: rootRoute.addChildren(enfants),
    history: createMemoryHistory({ initialEntries: [depart] }),
  })
  return render(<RouterProvider router={router} />)
}

const declencheur = () => screen.findByRole('button', { name: "Changer d'accès" })

describe('ScaleSelector', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: null })
  })

  it('ne rend rien pour un compte a une seule destination', async () => {
    useAuthStore.setState({ user: intervenantUnService })

    monter()

    // Laisser le routeur se monter avant de conclure a l'absence.
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('button', { name: "Changer d'accès" })).not.toBeInTheDocument()
  })

  it('rend une entree par couple accessible, et le lien vers tous les acces', async () => {
    useAuthStore.setState({ user: troisCouples })

    monter()
    await userEvent.click(await declencheur())

    expect(await screen.findAllByRole('button', { name: /Cardio|Pneumo/ })).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Tous les accès…' })).toBeInTheDocument()
  })

  // Un administrateur coordinateur d'un seul service n'avait pas de selecteur : l'administration
  // n'y figurait pas. Il a desormais deux destinations.
  it('propose l administration de l etablissement a un administrateur', async () => {
    useAuthStore.setState({ user: adminCoordinateur })

    monter()
    await userEvent.click(await declencheur())

    expect(await screen.findByRole('button', { name: "Administration de l'établissement" })).toBeInTheDocument()
  })

  it('ne propose la plateforme qu a un super-admin', async () => {
    useAuthStore.setState({ user: troisCouples })
    const { unmount } = monter()
    await userEvent.click(await declencheur())
    expect(screen.queryByRole('button', { name: 'Plateforme' })).not.toBeInTheDocument()
    unmount()

    useAuthStore.setState({ user: { ...troisCouples, isSuperAdmin: true } })
    monter()
    await userEvent.click(await declencheur())
    expect(await screen.findByRole('button', { name: 'Plateforme' })).toBeInTheDocument()
  })

  it('nomme l echelle de la route, pas le dernier contexte du store', async () => {
    useAuthStore.setState({
      user: adminCoordinateur,
      context: {
        establishmentId: 'e1',
        serviceId: 's1',
        establishmentRole: 'ADMIN',
        serviceRole: 'COORDINATEUR',
        soignantId: null,
      },
    })

    monter('/e/e1/admin/members')

    expect(await declencheur()).toHaveTextContent('CHU › Administration')
  })

  it('nomme le couple sous une route de service', async () => {
    useAuthStore.setState({ user: adminCoordinateur })

    monter('/e/e1/s/s1/dashboard')

    expect(await declencheur()).toHaveTextContent('CHU › Cardio')
  })
})
