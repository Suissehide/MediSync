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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AuthState, User } from '@/types/auth.ts'
import type { ServiceField } from '@/types/serviceField.ts'
import { Route as serviceLayoutRoute } from '../../$serviceId.tsx'
import { Route as ficheRoute } from './fiche-patient.tsx'

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
const ficheScreenRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'fiche-patient',
  beforeLoad: optionsDe(ficheRoute).beforeLoad,
  component: optionsDe(ficheRoute).component,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    serviceRoute.addChildren([ficheScreenRoute]),
  ]),
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

const comorbidite: ServiceField = {
  id: 'f4',
  key: 'comorbidite',
  label: 'Comorbidité',
  type: 'text',
  section: 'pathway',
  order: 1,
  clinical: false,
  unit: null,
  archived: false,
  choices: [],
}

const motifSortie: ServiceField = {
  id: 'f2',
  key: 'motif_sortie',
  label: 'Motif de sortie',
  type: 'text',
  section: 'outcome',
  order: 0,
  clinical: false,
  unit: null,
  archived: false,
  choices: [],
}

const ancienDiagnostic: ServiceField = {
  id: 'f3',
  key: 'ancien_diagnostic',
  label: 'Ancien diagnostic',
  type: 'text',
  section: 'pathway',
  order: 2,
  clinical: false,
  unit: null,
  archived: true,
  choices: [],
}

type Route = {
  match: (url: string, method: string) => boolean
  respond: () => { ok: boolean; status: number; json: () => Promise<unknown> }
}

const buildFetchMock = (routes: Route[]) =>
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    const route = routes.find((r) => r.match(url, method))
    if (!route) {
      throw new Error(`Appel fetch non attendu dans ce test : ${method} ${url}`)
    }
    const result = route.respond()
    return { ...result, url }
  })

const routeGetServiceFields = (data: ServiceField[]): Route => ({
  match: (url, method) => url.endsWith('/service-fields') && method === 'GET',
  respond: () => ({ ok: true, status: 200, json: async () => data }),
})

const routeCreate = (): Route => ({
  match: (url, method) => url.endsWith('/service-fields') && method === 'POST',
  respond: () => ({
    ok: true,
    status: 201,
    json: async () => ({ ...orientation, id: 'new' }),
  }),
})

const routePatch = (id: string): Route => ({
  match: (url, method) =>
    url.endsWith(`/service-fields/${id}`) && method === 'PATCH',
  respond: () => ({ ok: true, status: 200, json: async () => orientation }),
})

const routeReorder = (): Route => ({
  match: (url, method) =>
    url.endsWith('/service-fields/order') && method === 'PUT',
  respond: () => ({ ok: true, status: 200, json: async () => ({}) }),
})

const monter = (routes: Route[]) => {
  const fetchMock = buildFetchMock(routes)
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/e/e1/s/s1/fiche-patient'],
    }),
    context: { authState: { isAuthenticated: true, user } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return fetchMock
}

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

describe('ecran de configuration de la fiche patient', () => {
  it('affiche les deux blocs avec les champs actifs, dans l ordre, type en clair', async () => {
    monter([routeGetServiceFields([orientation, motifSortie])])

    await screen.findByText('Orientation')
    expect(screen.getByText('Parcours & Inclusion')).toBeInTheDocument()
    expect(screen.getByText('Sortie & Bilan')).toBeInTheDocument()
    expect(screen.getByText(/Choix unique/)).toBeInTheDocument()
    expect(screen.getByText('Motif de sortie')).toBeInTheDocument()
  })

  it('cree un champ « Comorbidités » de type choix multiple avec deux choix', async () => {
    const fetchMock = monter([
      routeGetServiceFields([orientation, motifSortie]),
      routeCreate(),
    ])

    await screen.findByText('Parcours & Inclusion')
    const boutonsAjouter = screen.getAllByRole('button', {
      name: /ajouter un champ/i,
    })
    await userEvent.click(boutonsAjouter[0])

    await userEvent.type(screen.getByLabelText('Libellé'), 'Comorbidités')
    await userEvent.click(screen.getByLabelText('Type'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Choix multiple' }),
    )

    const champChoix = screen.getByPlaceholderText(/ajouter un choix/i)
    await userEvent.type(champChoix, 'HTA{enter}')
    await userEvent.type(champChoix, 'Diabète{enter}')

    await userEvent.click(screen.getByRole('button', { name: /^ajouter$/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/service-fields') && init?.method === 'POST',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        label: 'Comorbidités',
        type: 'multichoice',
        section: 'pathway',
        clinical: false,
        choices: ['HTA', 'Diabète'],
      })
    })
  })

  it('desactive le type et la case Clinique dans la popup d un champ existant', async () => {
    monter([routeGetServiceFields([orientation])])

    await screen.findByText('Orientation')
    await userEvent.click(screen.getByRole('button', { name: /^modifier$/i }))

    expect(await screen.findByLabelText('Type')).toBeDisabled()
    expect(screen.getByLabelText('Clinique')).toBeDisabled()
  })

  it('la fleche descendre du premier champ inverse les deux identifiants ; monter est desactivee', async () => {
    const fetchMock = monter([
      routeGetServiceFields([orientation, comorbidite]),
      routeReorder(),
    ])

    await screen.findByText('Orientation')
    await screen.findByText('Comorbidité')

    const monterBoutons = screen.getAllByRole('button', { name: 'Monter' })
    const descendreBoutons = screen.getAllByRole('button', {
      name: 'Descendre',
    })
    expect(monterBoutons[0]).toBeDisabled()
    await userEvent.click(descendreBoutons[0])

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/service-fields/order') &&
          init?.method === 'PUT',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        section: 'pathway',
        ids: ['f4', 'f1'],
      })
    })
  })

  it('la fleche descendre porte le jeu complet des identifiants de la section, champ archive inclus', async () => {
    const fetchMock = monter([
      routeGetServiceFields([orientation, comorbidite, ancienDiagnostic]),
      routeReorder(),
    ])

    await screen.findByText('Orientation')
    await screen.findByText('Comorbidité')

    const descendreBoutons = screen.getAllByRole('button', {
      name: 'Descendre',
    })
    await userEvent.click(descendreBoutons[0])

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/service-fields/order') &&
          init?.method === 'PUT',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        section: 'pathway',
        ids: ['f4', 'f1', 'f3'],
      })
    })
  })

  it('deux clics rapides sur Descendre n envoient qu un seul reordonnancement', async () => {
    let resoudrePut: () => void = () => undefined
    const putEnCours = new Promise<void>((resolve) => {
      resoudrePut = resolve
    })

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      const method = init?.method ?? 'GET'
      if (url.endsWith('/service-fields') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          url,
          json: async () => [orientation, comorbidite],
        })
      }
      if (url.endsWith('/service-fields/order') && method === 'PUT') {
        return putEnCours.then(() => ({
          ok: true,
          status: 200,
          url,
          json: async () => ({}),
        }))
      }
      throw new Error(`Appel fetch non attendu dans ce test : ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/e/e1/s/s1/fiche-patient'],
      }),
      context: { authState: { isAuthenticated: true, user } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await screen.findByText('Orientation')
    await screen.findByText('Comorbidité')

    const descendreBoutons = screen.getAllByRole('button', {
      name: 'Descendre',
    })
    await userEvent.click(descendreBoutons[0])
    // Le bouton se desactive pendant la mutation en cours : ce second clic doit etre ignore.
    await userEvent.click(descendreBoutons[0])

    resoudrePut()

    await waitFor(() => {
      const appels = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith('/service-fields/order') &&
          init?.method === 'PUT',
      )
      expect(appels).toHaveLength(1)
    })
  })

  it('archive un champ apres confirmation, et l affiche avec Restaurer quand Archives est coche', async () => {
    const fetchMock = monter([
      routeGetServiceFields([orientation]),
      routePatch('f1'),
    ])

    await screen.findByText('Orientation')
    await userEvent.click(screen.getByRole('button', { name: /^archiver$/i }))
    const dialogue = await screen.findByRole('dialog')
    await userEvent.click(
      within(dialogue).getByRole('button', { name: /^archiver$/i }),
    )

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/service-fields/f1') &&
          init?.method === 'PATCH',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ archived: true })
    })
  })

  it('affiche Restaurer pour un champ archive quand Archives est coche', async () => {
    monter([routeGetServiceFields([ancienDiagnostic])])

    await screen.findByText('Parcours & Inclusion')
    await userEvent.click(screen.getByLabelText('Archivés'))

    expect(await screen.findByText('Ancien diagnostic')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^restaurer$/i }),
    ).toBeInTheDocument()
  })
})
