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
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { ActivityReport } from '@/types/activity.ts'
import type { AuthState, User } from '@/types/auth.ts'
import { Route as serviceLayoutRoute } from '../$serviceId.tsx'
import { Route as activiteRoute } from './activite.tsx'

dayjs.extend(utc)

// Trois états TOUJOURS distincts — chargement, erreur, données — plus le refus de l'écran à qui
// n'a pas `activity:read`. Harnais recopié d'`indicateurs-ars.test.tsx`.

const optionsDe = (route: AnyRoute) => route.options

const avecRole = (
  id: string,
  role: 'COORDINATEUR' | 'INTERVENANT' | 'LECTURE',
): User => ({
  id,
  email: `${id}@b.fr`,
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [{ id: 's1', name: 'Cardio', role }],
    },
  ],
})

const coordinateur = avecRole('u1', 'COORDINATEUR')
const intervenant = avecRole('u2', 'INTERVENANT')
const lecture = avecRole('u3', 'LECTURE')

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
const dashboardRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'dashboard',
  component: () => <p>Tableau de bord</p>,
})
const activiteScreenRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'activite',
  beforeLoad: optionsDe(activiteRoute).beforeLoad,
  component: optionsDe(activiteRoute).component,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    serviceRoute.addChildren([dashboardRoute, activiteScreenRoute]),
  ]),
])

const vide = { absent: 0, pointed: 0, rate: null }

const rapport: ActivityReport = {
  from: '2026-01-01',
  to: '2026-12-31',
  patients: { active: 148, newlyIncluded: 57, exited: 42 },
  completion: {
    completed: 31,
    exited: 42,
    rate: 31 / 42,
    dropouts: 11,
    dropoutReasons: [{ reason: 'PERDU_DE_VUE', count: 5 }],
  },
  absences: {
    overall: { absent: 12, pointed: 100, rate: 0.12 },
    worst: { thematic: 'Coaching; PRM', weekday: 1 },
    weekdays: [1],
    byThematic: [
      {
        thematic: 'Coaching; PRM',
        total: { absent: 4, pointed: 10, rate: 0.4 },
        cells: [
          vide,
          { absent: 4, pointed: 10, rate: 0.4 },
          vide,
          vide,
          vide,
          vide,
          vide,
        ],
      },
    ],
    byPathway: [],
  },
  sessions: {
    individual: 312,
    collective: 96,
    educationalDiagnoses: 41,
    finalReviews: 28,
  },
  hoursBySoignant: [{ soignant: 'IDE', hours: 120.5 }],
}

const monter = (
  reponse: { ok: boolean; status: number; corps?: unknown },
  user: User = coordinateur,
) => {
  // Le mock est SÉLECTIF : `DashboardLayout` monte aussi la barre et son panneau de tâches, qui
  // appellent d'autres routes. Une réponse unique pour tout ferait échouer l'écran pour une raison
  // qui n'a rien à voir avec ce qu'on éprouve ici.
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/activite')) {
        return {
          ok: reponse.ok,
          status: reponse.status,
          url,
          json: async () => reponse.corps,
        }
      }
      return { ok: true, status: 200, url, json: async () => [] }
    }),
  )
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/e/e1/s/s1/activite'],
    }),
    context: { authState: { isAuthenticated: true, user } },
  })
  render(
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </LocalizationProvider>,
  )
}

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: coordinateur,
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
  vi.restoreAllMocks()
})

describe('ecran d activite', () => {
  it('repond aux trois questions du critere de fin', async () => {
    monter({ ok: true, status: 200, corps: rapport }, lecture)
    expect(await screen.findByText('148')).toBeInTheDocument()
    expect(screen.getByText(/31 sur 42 sortis/)).toBeInTheDocument()
    expect(screen.getByText('12 %')).toBeInTheDocument()
    expect(screen.getByText(/Coaching; PRM, le mardi/)).toBeInTheDocument()
  })

  it('annonce une erreur plutot que des chiffres muets', async () => {
    monter({ ok: false, status: 500 })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Impossible de charger l'activité/,
    )
    expect(
      screen.getByRole('button', { name: 'Exporter en CSV' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Réessayer' }),
    ).toBeInTheDocument()
  })

  it('invite a changer de periode quand rien ne s est passe', async () => {
    const calme = {
      ...rapport,
      patients: { active: 0, newlyIncluded: 0, exited: 0 },
      completion: {
        completed: 0,
        exited: 0,
        rate: null,
        dropouts: 0,
        dropoutReasons: [],
      },
      absences: {
        overall: { absent: 0, pointed: 0, rate: null },
        worst: null,
        weekdays: [],
        byThematic: [],
        byPathway: [],
      },
      sessions: {
        individual: 0,
        collective: 0,
        educationalDiagnoses: 0,
        finalReviews: 0,
      },
      hoursBySoignant: [],
    }
    monter({ ok: true, status: 200, corps: calme })
    expect(
      await screen.findByText(/Aucune activité sur cette période/),
    ).toBeInTheDocument()
  })

  // Review Focus 5, côté écran.
  it('renvoie un intervenant au tableau de bord', async () => {
    monter({ ok: true, status: 200, corps: rapport }, intervenant)
    expect(await screen.findByText('Tableau de bord')).toBeInTheDocument()
  })
})
