import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { TenantContext } from '@/types/auth.ts'

import { PatientAccessLogButton } from './patientAccessLogButton.tsx'

// Étape 4b, tâche 11 (brief, « un petit reste de la tâche 10 ») : le bouton « Journal des accès »
// de la fiche patient n'avait AUCUN test — ni sa visibilité conditionnelle (`consultations:read`,
// réservée au rôle COORDINATEUR — `utils/permissions.ts`), ni les paramètres de son lien. Ce
// fichier ferme les deux, sur le VRAI composant (`patientAccessLogButton.tsx`, extrait de
// `patient/$patientID/index.tsx` pour cette raison précise).
//
// Routeur minimal, sans arbre de routes réel (même convention que `tenantSelector.test.tsx`) :
// `Link` interpole son `href` à partir de `to`/`params` (`router.buildLocation`, string
// resolution), sans exiger que la destination soit un nœud enregistré de CE routeur de test.
const contextCoordinateur: TenantContext = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'MEMBER',
  serviceRole: 'COORDINATEUR',
  soignantId: 'so1',
}

const contextIntervenant: TenantContext = {
  ...contextCoordinateur,
  serviceRole: 'INTERVENANT',
}

const monter = () => {
  const rootRoute = createRootRoute({
    component: () => (
      <PatientAccessLogButton establishmentId="e1" serviceId="s1" patientID="p1" />
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  useAuthStore.setState({ context: null })
})

describe('PatientAccessLogButton', () => {
  it("ne rend rien pour un role sans consultations:read (INTERVENANT) — absent du DOM, pas seulement masque", () => {
    useAuthStore.setState({ context: contextIntervenant })

    const { container } = monter()

    expect(screen.queryByRole('link', { name: /journal des accès/i })).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('rend le lien pour un COORDINATEUR, avec les bons parametres (etablissement/service/patient)', () => {
    useAuthStore.setState({ context: contextCoordinateur })

    monter()

    const lien = screen.getByRole('link', { name: /journal des accès/i })
    expect(lien).toHaveAttribute('href', '/e/e1/s/s1/patient/p1/acces')
  })

  it('reconstruit le lien pour un autre couple etablissement/service/patient, sans jamais les melanger', () => {
    useAuthStore.setState({ context: contextCoordinateur })

    const rootRoute = createRootRoute({
      component: () => (
        <PatientAccessLogButton establishmentId="e9" serviceId="s9" patientID="p9" />
      ),
    })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)

    const lien = screen.getByRole('link', { name: /journal des accès/i })
    expect(lien).toHaveAttribute('href', '/e/e9/s/s9/patient/p9/acces')
  })

  it("ne rend rien sans contexte du tout (compte deconnecte du tenant)", () => {
    useAuthStore.setState({ context: null })

    monter()

    expect(screen.queryByRole('link', { name: /journal des accès/i })).not.toBeInTheDocument()
  })
})
