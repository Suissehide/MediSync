import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AuthState, User } from '@/types/auth.ts'
import type {
  ServiceField,
  ServiceFieldCategory,
} from '@/types/serviceField.ts'
import { Route as serviceLayoutRoute } from '../../$serviceId.tsx'
import { Route as patientListRoute } from './index.tsx'

// Harnais recopié d'`activite.test.tsx`.
const optionsDe = (route: AnyRoute) => route.options

const user: User = {
  id: 'u1',
  email: 'u1@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [{ id: 's1', name: 'Cardio', role: 'COORDINATEUR' }],
    },
  ],
}

const rootRoute = createRootRouteWithContext<{ authState: AuthState }>()({
  component: () => <Outlet />,
})
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '/_authenticated',
  component: () => <Outlet />,
})
const serviceRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'e/$establishmentId/s/$serviceId',
  beforeLoad: optionsDe(serviceLayoutRoute).beforeLoad,
  remountDeps: optionsDe(serviceLayoutRoute).remountDeps,
  component: () => <Outlet />,
})
const listRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'patient',
  component: optionsDe(patientListRoute).component,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([serviceRoute.addChildren([listRoute])]),
])

const orientation: ServiceField = {
  id: 'f1',
  key: 'orientation',
  label: 'Orientation',
  type: 'choice',
  categoryId: 'cat-parcours',
  order: 0,
  clinical: false,
  unit: null,
  archived: false,
  choices: [
    { id: 'c1', key: 'A', label: 'Choix A', order: 0, archived: false },
    { id: 'c2', key: 'B', label: 'Choix B', order: 1, archived: false },
  ],
}

const categories: ServiceFieldCategory[] = [
  {
    id: 'cat-parcours',
    label: 'Parcours & Inclusion',
    order: 0,
    dateField: 'entryDate',
    archived: false,
  },
]

const patients = [
  {
    id: 'p1',
    firstName: 'Ana',
    lastName: 'Alpha',
    pathwayTemplateTags: [],
    data: { orientation: 'A' },
  },
  {
    id: 'p2',
    firstName: 'Bob',
    lastName: 'Beta',
    pathwayTemplateTags: [],
    data: { orientation: 'B' },
  },
]

const TABLE = 'patient/s1/u1'

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user,
    context: {
      establishmentId: 'e1',
      serviceId: 's1',
      establishmentRole: 'MEMBER',
      serviceRole: 'COORDINATEUR',
      soignantId: null,
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Visibilité et filtre mémorisés sous l'ancien groupement (Inclusion/Bilan) : seul l'id compte.
const memoriserColonneOrientation = () => {
  localStorage.setItem(
    `column-visibility/${TABLE}`,
    JSON.stringify({ orientation: true }),
  )
  localStorage.setItem(
    `filters/${TABLE}`,
    JSON.stringify([{ id: 'orientation', value: ['A'] }]),
  )
}

// Monte la liste en retenant la réponse d'une des deux lectures ; renvoie de quoi la livrer.
const monterEnRetenant = (
  retenue: '/service-fields' | '/service-field-categories',
) => {
  let livrer: () => void = () => undefined
  const livree = new Promise<void>((resolve) => {
    livrer = resolve
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.endsWith(retenue)) {
        await livree
      }
      if (url.endsWith('/service-fields')) {
        return { ok: true, status: 200, url, json: async () => [orientation] }
      }
      if (url.endsWith('/service-field-categories')) {
        return { ok: true, status: 200, url, json: async () => categories }
      }
      if (url.includes('/patient/with-tags')) {
        return { ok: true, status: 200, url, json: async () => patients }
      }
      return { ok: true, status: 200, url, json: async () => [] }
    }),
  )

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/e/e1/s/s1/patient'] }),
    context: { authState: { isAuthenticated: true, user } },
  })
  render(
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <RouterProvider router={router} />
      </QueryClientProvider>
    </LocalizationProvider>,
  )
  return livrer
}

const attendreColonneOrientationFiltree = async () => {
  // Filtre appliqué (une ligne sur deux) et colonne affichée.
  expect(await screen.findByText('1 résultat')).toBeInTheDocument()
  expect(
    screen.getByRole('columnheader', { name: /Orientation/ }),
  ).toBeInTheDocument()
  expect(
    JSON.parse(localStorage.getItem(`column-visibility/${TABLE}`) ?? '{}'),
  ).toMatchObject({ orientation: true })
  expect(JSON.parse(localStorage.getItem(`filters/${TABLE}`) ?? '[]')).toEqual([
    { id: 'orientation', value: ['A'] },
  ])
}

describe('liste des patients, premier chargement', () => {
  for (const retenue of [
    '/service-fields',
    '/service-field-categories',
  ] as const) {
    it(`garde la visibilite et le filtre sauves d une colonne configurable quand ${retenue} arrive apres le premier rendu`, async () => {
      memoriserColonneOrientation()
      const livrer = monterEnRetenant(retenue)

      await screen.findByText('Liste des patients')
      // Les patients sont arrivés, pas encore la lecture retenue : on laisse les effets tourner.
      await new Promise((resolve) => setTimeout(resolve, 50))
      livrer()

      await attendreColonneOrientationFiltree()
    })
  }
})

// Monte la liste avec `/service-fields` en échec au premier appel, puis au succès dès le second
// (le bouton « Réessayer » appelle `refetch`) ; les autres lectures répondent normalement.
const monterAvecEchecPuisSucces = () => {
  let appels = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.endsWith('/service-fields')) {
        appels += 1
        if (appels === 1) {
          return { ok: false, status: 500, url, json: async () => ({}) }
        }
        return { ok: true, status: 200, url, json: async () => [orientation] }
      }
      if (url.endsWith('/service-field-categories')) {
        return { ok: true, status: 200, url, json: async () => categories }
      }
      if (url.includes('/patient/with-tags')) {
        return { ok: true, status: 200, url, json: async () => patients }
      }
      return { ok: true, status: 200, url, json: async () => [] }
    }),
  )

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/e/e1/s/s1/patient'] }),
    context: { authState: { isAuthenticated: true, user } },
  })
  render(
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <RouterProvider router={router} />
      </QueryClientProvider>
    </LocalizationProvider>,
  )
}

describe('liste des patients, lecture des champs en echec', () => {
  it("ne touche pas la visibilite/le filtre sauves quand /service-fields echoue, et affiche la colonne apres Réessayer", async () => {
    memoriserColonneOrientation()
    monterAvecEchecPuisSucces()

    await screen.findByText('Liste des patients')
    expect(
      await screen.findByText('Impossible de charger les champs du service.'),
    ).toBeInTheDocument()

    // Pas de table montee, donc pas d ecrasement des valeurs sauvees.
    expect(
      JSON.parse(localStorage.getItem(`column-visibility/${TABLE}`) ?? '{}'),
    ).toMatchObject({ orientation: true })
    expect(JSON.parse(localStorage.getItem(`filters/${TABLE}`) ?? '[]')).toEqual([
      { id: 'orientation', value: ['A'] },
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    await attendreColonneOrientationFiltree()
  })
})
