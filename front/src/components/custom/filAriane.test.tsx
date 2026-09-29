import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'
import { LAST_CONTEXT_KEY } from '@/utils/tenant-context.ts'
import { FilAriane } from './filAriane.tsx'

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
      services: [{ id: 's1', name: 'Cardio', role: 'INTERVENANT' }],
    },
  ],
}

// Deux etablissements : le CHU, administre, et une clinique atteinte par un octroi.
const deuxEtablissements: User = {
  ...base,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'ADMIN',
      services: [
        { id: 's1', name: 'Cardio', role: 'COORDINATEUR' },
        { id: 's2', name: 'Pneumo', role: 'INTERVENANT' },
      ],
    },
    {
      id: 'e2',
      name: 'Clinique du Parc',
      role: 'MEMBER',
      origine: 'octroi',
      services: [{ id: 's3', name: 'Diabéto', role: 'LECTURE' }],
    },
  ],
}

// Routeur minimal : quelques chemins aux formes des trois echelles, pour que le fil, lu sur la
// route, ait de quoi se resoudre.
const monter = (depart: string) => {
  const rootRoute = createRootRoute({ component: FilAriane })
  const enfants = [
    '/e/$establishmentId/s/$serviceId/dashboard',
    '/e/$establishmentId/admin/members',
    '/super-admin',
    '/user/settings',
  ].map((path) => createRoute({ getParentRoute: () => rootRoute, path }))
  const router = createRouter({
    routeTree: rootRoute.addChildren(enfants),
    history: createMemoryHistory({ initialEntries: [depart] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

const fil = () => screen.findByRole('navigation', { name: "Fil d'Ariane" })

describe('FilAriane', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ context: null })
  })

  it('nomme l etablissement et le service de la route, sans menu pour un seul service', async () => {
    useAuthStore.setState({ user: intervenantUnService })
    monter('/e/e1/s/s1/dashboard')

    expect(await fil()).toHaveTextContent('CHU')
    expect(await fil()).toHaveTextContent('Cardio')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // Simple membre : l'etablissement n'est pas un lien vers l'administration.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('fait de l etablissement un lien vers son administration pour qui l administre', async () => {
    useAuthStore.setState({ user: deuxEtablissements })
    monter('/e/e1/s/s1/dashboard')

    expect(
      within(await fil()).getByRole('link', { name: /CHU/ }),
    ).toHaveAttribute('href', '/e/e1/admin/members')
  })

  it('liste les services par etablissement, marque le courant et l acces temporaire', async () => {
    useAuthStore.setState({ user: deuxEtablissements })
    monter('/e/e1/s/s1/dashboard')

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Changer de service (actuellement : Cardio)',
      }),
    )

    const courant = await screen.findByRole('button', { current: true })
    expect(courant).toHaveTextContent('Cardio')
    expect(screen.getByRole('button', { name: /Pneumo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Diabéto/ })).toBeInTheDocument()
    expect(screen.getByText('Accès temporaire')).toBeInTheDocument()
    // L'en-tete du CHU mene a son administration ; celui de la clinique, non administree, non.
    expect(
      screen.getByRole('button', { name: /CHU.*Administrer/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Clinique du Parc/ }),
    ).not.toBeInTheDocument()
    // Le lien vers la plateforme est reserve au super-admin.
    expect(
      screen.queryByText(/Gérer les établissements/),
    ).not.toBeInTheDocument()
  })

  it('ramene au dernier service visite depuis l administration', async () => {
    useAuthStore.setState({ user: deuxEtablissements })
    localStorage.setItem(
      LAST_CONTEXT_KEY('u1'),
      JSON.stringify({ establishmentId: 'e1', serviceId: 's2' }),
    )
    monter('/e/e1/admin/members')

    const retour = within(await fil()).getByRole('link', {
      name: /Pneumo/,
    })
    expect(retour).toHaveAttribute('href', '/e/e1/s/s2/dashboard')
    expect(
      within(await fil()).getByRole('link', { name: /CHU/ }),
    ).toHaveAttribute('aria-current', 'page')
  })

  // Le dernier service visite est dans un autre etablissement : on revient au premier service
  // de celui qu'on administre, pas dans un autre etablissement.
  it('reste dans l etablissement administre quand le dernier service est ailleurs', async () => {
    useAuthStore.setState({ user: deuxEtablissements })
    localStorage.setItem(
      LAST_CONTEXT_KEY('u1'),
      JSON.stringify({ establishmentId: 'e2', serviceId: 's3' }),
    )
    monter('/e/e1/admin/members')

    expect(
      within(await fil()).getByRole('link', { name: /Cardio/ }),
    ).toHaveAttribute('href', '/e/e1/s/s1/dashboard')
  })

  it('montre le dernier service visite hors des echelles, avec le badge temporaire', async () => {
    useAuthStore.setState({ user: deuxEtablissements })
    localStorage.setItem(
      LAST_CONTEXT_KEY('u1'),
      JSON.stringify({ establishmentId: 'e2', serviceId: 's3' }),
    )
    monter('/user/settings')

    expect(await fil()).toHaveTextContent('Clinique du Parc')
    expect(await fil()).toHaveTextContent('temporaire')
    expect(
      within(await fil()).getByRole('link', { name: /Diabéto/ }),
    ).toHaveAttribute('href', '/e/e2/s/s3/dashboard')
  })

  it('ne rend rien pour un super-admin sans appartenance', async () => {
    useAuthStore.setState({
      user: { ...base, isSuperAdmin: true, establishments: [] },
    })
    monter('/super-admin')

    await new Promise((r) => setTimeout(r, 0))
    expect(
      screen.queryByRole('navigation', { name: "Fil d'Ariane" }),
    ).not.toBeInTheDocument()
  })
})
