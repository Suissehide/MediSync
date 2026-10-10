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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AuthState, User } from '@/types/auth.ts'
import type { ServiceField } from '@/types/serviceField.ts'
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
  section: 'pathway',
  order: 0,
  clinical: false,
  unit: null,
  archived: false,
  choices: [
    { id: 'c1', key: 'A', label: 'Choix A', order: 0, archived: false },
    { id: 'c2', key: 'B', label: 'Choix B', order: 1, archived: false },
  ],
}

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

describe('liste des patients, premier chargement', () => {
  it('garde la visibilite et le filtre sauves d une colonne configurable arrivee apres le premier rendu', async () => {
    localStorage.setItem(
      `column-visibility/${TABLE}`,
      JSON.stringify({ orientation: true }),
    )
    localStorage.setItem(
      `filters/${TABLE}`,
      JSON.stringify([{ id: 'orientation', value: ['A'] }]),
    )

    let livrerChamps: (champs: ServiceField[]) => void = () => undefined
    const champs = new Promise<ServiceField[]>((resolve) => {
      livrerChamps = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.endsWith('/service-fields')) {
          const corps = await champs
          return { ok: true, status: 200, url, json: async () => corps }
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

    await screen.findByText('Liste des patients')
    // Les patients sont arrivés, pas encore les champs : on laisse les effets tourner.
    await new Promise((resolve) => setTimeout(resolve, 50))
    livrerChamps([orientation])

    // Filtre appliqué (une ligne sur deux) et colonne affichée.
    expect(await screen.findByText('1 résultat')).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: /Orientation/ }),
    ).toBeInTheDocument()
    expect(
      JSON.parse(localStorage.getItem(`column-visibility/${TABLE}`) ?? '{}'),
    ).toMatchObject({ orientation: true })
    expect(
      JSON.parse(localStorage.getItem(`filters/${TABLE}`) ?? '[]'),
    ).toEqual([{ id: 'orientation', value: ['A'] }])
  })
})
