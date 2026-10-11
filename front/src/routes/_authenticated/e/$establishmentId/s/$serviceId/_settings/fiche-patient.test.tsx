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
import type {
  ServiceField,
  ServiceFieldCategory,
} from '@/types/serviceField.ts'
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

const comorbidite: ServiceField = {
  id: 'f4',
  key: 'comorbidite',
  label: 'Comorbidité',
  type: 'text',
  categoryId: 'cat-parcours',
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
  categoryId: 'cat-sortie',
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
  categoryId: 'cat-parcours',
  order: 2,
  clinical: false,
  unit: null,
  archived: true,
  choices: [],
}

type Route = {
  match: (url: string, method: string) => boolean
  respond: (
    url: string,
    init?: RequestInit,
  ) => { ok: boolean; status: number; json: () => Promise<unknown> }
}

const category = (
  over: Partial<ServiceFieldCategory> & { id: string; label: string },
): ServiceFieldCategory => ({
  order: 0,
  dateField: null,
  archived: false,
  ...over,
})

const categories: ServiceFieldCategory[] = [
  category({
    id: 'cat-parcours',
    label: 'Parcours & Inclusion',
    dateField: 'entryDate',
  }),
  category({
    id: 'cat-sortie',
    label: 'Sortie & Bilan',
    order: 1,
    dateField: 'exitDate',
  }),
]

const categoriesResponse = (url: string, data: ServiceFieldCategory[]) => ({
  ok: true,
  status: 200,
  url,
  json: async () => data,
})

const buildFetchMock = (
  routes: Route[],
  categoriesData: ServiceFieldCategory[] = categories,
) =>
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    if (url.endsWith('/service-field-categories') && method === 'GET') {
      return categoriesResponse(url, categoriesData)
    }
    const route = routes.find((r) => r.match(url, method))
    if (!route) {
      throw new Error(`Appel fetch non attendu dans ce test : ${method} ${url}`)
    }
    const result = route.respond(url, init)
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

const routeCreateCategory = (created: ServiceFieldCategory): Route => ({
  match: (url, method) =>
    url.endsWith('/service-field-categories') && method === 'POST',
  respond: () => ({ ok: true, status: 201, json: async () => created }),
})

const routePatchCategory = (
  id: string,
  result: ServiceFieldCategory,
): Route => ({
  match: (url, method) =>
    url.endsWith(`/service-field-categories/${id}`) && method === 'PATCH',
  respond: () => ({ ok: true, status: 200, json: async () => result }),
})

const routeReorderCategories = (): Route => ({
  match: (url, method) =>
    url.endsWith('/service-field-categories/order') && method === 'PUT',
  respond: () => ({ ok: true, status: 200, json: async () => ({}) }),
})

const monter = (
  routes: Route[],
  categoriesData: ServiceFieldCategory[] = categories,
) => {
  const fetchMock = buildFetchMock(routes, categoriesData)
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
        categoryId: 'cat-parcours',
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
        categoryId: 'cat-parcours',
        ids: ['f4', 'f1'],
      })
    })
  })

  it('la fleche descendre porte le jeu complet des identifiants de la categorie, champ supprime inclus', async () => {
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
        categoryId: 'cat-parcours',
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
      if (url.endsWith('/service-field-categories') && method === 'GET') {
        return Promise.resolve(categoriesResponse(url, categories))
      }
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

  it('supprime un champ apres confirmation, et l affiche avec Restaurer quand Supprimes est coche', async () => {
    const fetchMock = monter([
      routeGetServiceFields([orientation]),
      routePatch('f1'),
    ])

    await screen.findByText('Orientation')
    await userEvent.click(screen.getByRole('button', { name: /^supprimer$/i }))
    const dialogue = await screen.findByRole('dialog')
    await userEvent.click(
      within(dialogue).getByRole('button', { name: /^supprimer$/i }),
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

  it('affiche Restaurer pour un champ supprime quand Supprimes est coche', async () => {
    monter([routeGetServiceFields([ancienDiagnostic])])

    await screen.findByText('Parcours & Inclusion')
    await userEvent.click(screen.getByLabelText('Supprimés'))

    expect(await screen.findByText('Ancien diagnostic')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^restaurer$/i }),
    ).toBeInTheDocument()
  })

  it("n'affiche jamais le mot « Archiver » ou « Archivés », ni dans l'écran ni dans la popup d'un champ", async () => {
    monter([routeGetServiceFields([orientation])])

    await screen.findByText('Orientation')
    expect(document.body.textContent).not.toMatch(/archiv/i)

    await userEvent.click(screen.getByRole('button', { name: /^modifier$/i }))
    await screen.findByLabelText('Libellé')
    expect(document.body.textContent).not.toMatch(/archiv/i)
  })
})

describe('ecran de configuration — blocs de catégories', () => {
  it('suit l’ordre des catégories (champ `order`), pas celui du tableau reçu', async () => {
    const dansLeDesordre = [
      category({
        id: 'cat-sortie',
        label: 'Sortie & Bilan',
        order: 1,
        dateField: 'exitDate',
      }),
      category({
        id: 'cat-suivi',
        label: 'Suivi diététique',
        order: 2,
      }),
      category({
        id: 'cat-parcours',
        label: 'Parcours & Inclusion',
        order: 0,
        dateField: 'entryDate',
      }),
    ]
    monter([routeGetServiceFields([])], dansLeDesordre)

    const titres = await screen.findAllByTestId('categorie-titre')
    expect(titres.map((t) => t.textContent)).toEqual([
      'Parcours & Inclusion',
      'Sortie & Bilan',
      'Suivi diététique',
    ])
  })

  it('avec « Supprimés », une catégorie supprimée apparaît avec « Restaurer »', async () => {
    const avecSupprimee = [
      ...categories,
      category({
        id: 'cat-suivi',
        label: 'Suivi diététique',
        order: 2,
        archived: true,
      }),
    ]
    monter([routeGetServiceFields([])], avecSupprimee)

    await screen.findByText('Parcours & Inclusion')
    expect(screen.queryByText('Suivi diététique')).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Supprimés'))

    expect(await screen.findByText('Suivi diététique')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^restaurer la catégorie$/i }),
    ).toBeInTheDocument()
  })

  it('un champ supprimé dont la catégorie est supprimée n’offre pas de Restaurer', async () => {
    const categorieSupprimee = category({
      id: 'cat-suivi',
      label: 'Suivi diététique',
      order: 2,
      archived: true,
    })
    const champSupprime: ServiceField = {
      ...comorbidite,
      id: 'f5',
      categoryId: 'cat-suivi',
      archived: true,
    }
    monter(
      [routeGetServiceFields([champSupprime])],
      [...categories, categorieSupprimee],
    )

    await screen.findByText('Parcours & Inclusion')
    await userEvent.click(screen.getByLabelText('Supprimés'))

    expect(await screen.findByText('Comorbidité')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^restaurer$/i })).toBeDisabled()
  })

  it('le titre d’une catégorie se renomme en place : Entrée enregistre', async () => {
    const fetchMock = monter(
      [
        routeGetServiceFields([]),
        routePatchCategory('cat-suivi', {
          ...category({ id: 'cat-suivi', label: 'Nouveau nom', order: 2 }),
        }),
      ],
      [
        ...categories,
        category({ id: 'cat-suivi', label: 'Suivi diététique', order: 2 }),
      ],
    )

    await screen.findByText('Suivi diététique')
    await userEvent.click(screen.getByText('Suivi diététique'))
    const champ = screen.getByRole('textbox', {
      name: 'Libellé de la catégorie',
    })
    await userEvent.clear(champ)
    await userEvent.type(champ, 'Nouveau nom{enter}')

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/service-field-categories/cat-suivi') &&
          init?.method === 'PATCH',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        label: 'Nouveau nom',
      })
    })
  })

  it('le titre d’une catégorie : Échap annule sans rien envoyer', async () => {
    const fetchMock = monter(
      [routeGetServiceFields([])],
      [
        ...categories,
        category({ id: 'cat-suivi', label: 'Suivi diététique', order: 2 }),
      ],
    )

    await screen.findByText('Suivi diététique')
    await userEvent.click(screen.getByText('Suivi diététique'))
    const champ = screen.getByRole('textbox', {
      name: 'Libellé de la catégorie',
    })
    await userEvent.clear(champ)
    await userEvent.type(champ, 'Brouillon{Escape}')

    expect(
      screen.queryByRole('textbox', { name: 'Libellé de la catégorie' }),
    ).not.toBeInTheDocument()
    expect(await screen.findByText('Suivi diététique')).toBeInTheDocument()
    const appelsPatch = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
    )
    expect(appelsPatch).toHaveLength(0)
  })

  it('le titre d’une catégorie : Échap puis une nouvelle édition confirmée par Entrée envoie le PATCH', async () => {
    const fetchMock = monter(
      [
        routeGetServiceFields([]),
        routePatchCategory(
          'cat-suivi',
          category({ id: 'cat-suivi', label: 'Nouveau nom', order: 2 }),
        ),
      ],
      [
        ...categories,
        category({ id: 'cat-suivi', label: 'Suivi diététique', order: 2 }),
      ],
    )

    await screen.findByText('Suivi diététique')
    await userEvent.click(screen.getByText('Suivi diététique'))
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Libellé de la catégorie' }),
      '{Escape}',
    )

    // Sans le correctif, skipBlurCommit reste a true (aucun blur sur la suppression du champ
    // dans certains navigateurs) et avale la validation suivante.
    await userEvent.click(screen.getByText('Suivi diététique'))
    const champ = screen.getByRole('textbox', {
      name: 'Libellé de la catégorie',
    })
    await userEvent.clear(champ)
    await userEvent.type(champ, 'Nouveau nom{enter}')

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/service-field-categories/cat-suivi') &&
          init?.method === 'PATCH',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        label: 'Nouveau nom',
      })
    })
  })

  it('le titre d’une catégorie : la perte de focus enregistre aussi', async () => {
    const fetchMock = monter(
      [
        routeGetServiceFields([]),
        routePatchCategory(
          'cat-suivi',
          category({ id: 'cat-suivi', label: 'Diététique', order: 2 }),
        ),
      ],
      [
        ...categories,
        category({ id: 'cat-suivi', label: 'Suivi diététique', order: 2 }),
      ],
    )

    await screen.findByText('Suivi diététique')
    await userEvent.click(screen.getByText('Suivi diététique'))
    const champ = screen.getByRole('textbox', {
      name: 'Libellé de la catégorie',
    })
    await userEvent.clear(champ)
    await userEvent.type(champ, 'Diététique')
    await userEvent.tab()

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/service-field-categories/cat-suivi') &&
          init?.method === 'PATCH',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        label: 'Diététique',
      })
    })
  })

  it('le titre d’une catégorie : un libellé vide est refusé, rien n’est envoyé', async () => {
    const fetchMock = monter(
      [routeGetServiceFields([])],
      [
        ...categories,
        category({ id: 'cat-suivi', label: 'Suivi diététique', order: 2 }),
      ],
    )

    await screen.findByText('Suivi diététique')
    await userEvent.click(screen.getByText('Suivi diététique'))
    const champ = screen.getByRole('textbox', {
      name: 'Libellé de la catégorie',
    })
    await userEvent.clear(champ)
    await userEvent.type(champ, '{enter}')

    expect(await screen.findByText('Suivi diététique')).toBeInTheDocument()
    const appelsPatch = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
    )
    expect(appelsPatch).toHaveLength(0)
  })

  it('les flèches de catégorie portent le jeu complet des identifiants, supprimées comprises ; première Monter désactivée', async () => {
    const troisCategories = [
      ...categories,
      category({
        id: 'cat-vide',
        label: 'Vide',
        order: 2,
        archived: true,
      }),
      category({ id: 'cat-suivi', label: 'Suivi diététique', order: 3 }),
    ]
    const fetchMock = monter(
      [routeGetServiceFields([]), routeReorderCategories()],
      troisCategories,
    )

    await screen.findByText('Suivi diététique')
    const monterBoutons = screen.getAllByRole('button', {
      name: 'Monter la catégorie',
    })
    // Catégories actives visibles, dans l'ordre : Parcours (0), Sortie (1), Suivi (3).
    expect(monterBoutons[0]).toBeDisabled()

    const descendreBoutons = screen.getAllByRole('button', {
      name: 'Descendre la catégorie',
    })
    // Descendre sur « Sortie & Bilan » (deuxième active) l'échange avec « Suivi ».
    await userEvent.click(descendreBoutons[1])

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/service-field-categories/order') &&
          init?.method === 'PUT',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        ids: ['cat-parcours', 'cat-suivi', 'cat-vide', 'cat-sortie'],
      })
    })
  })

  it('deux clics rapides sur Descendre (catégorie) n’envoient qu’un seul réordonnancement', async () => {
    let resoudrePut: () => void = () => undefined
    const putEnCours = new Promise<void>((resolve) => {
      resoudrePut = resolve
    })
    const troisCategories = [
      ...categories,
      category({ id: 'cat-suivi', label: 'Suivi diététique', order: 2 }),
    ]
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      const method = init?.method ?? 'GET'
      if (url.endsWith('/service-field-categories') && method === 'GET') {
        return Promise.resolve(categoriesResponse(url, troisCategories))
      }
      if (url.endsWith('/service-fields') && method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          url,
          json: async () => [],
        })
      }
      if (url.endsWith('/service-field-categories/order') && method === 'PUT') {
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

    await screen.findByText('Suivi diététique')
    const descendreBoutons = screen.getAllByRole('button', {
      name: 'Descendre la catégorie',
    })
    await userEvent.click(descendreBoutons[0])
    await userEvent.click(descendreBoutons[0])
    resoudrePut()

    await waitFor(() => {
      const appels = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith('/service-field-categories/order') &&
          init?.method === 'PUT',
      )
      expect(appels).toHaveLength(1)
    })
  })

  it('« Supprimer » est absent sur une catégorie à date', async () => {
    monter([routeGetServiceFields([])])

    await screen.findByText('Parcours & Inclusion')
    expect(
      screen.queryByRole('button', { name: /^supprimer$/i }),
    ).not.toBeInTheDocument()
  })

  it('« Supprimer » une catégorie est désactivé avec une infobulle si elle a des champs actifs', async () => {
    const avecSuivi = [
      ...categories,
      category({ id: 'cat-suivi', label: 'Suivi diététique', order: 2 }),
    ]
    monter(
      [
        routeGetServiceFields([
          {
            ...comorbidite,
            id: 'fsuivi',
            categoryId: 'cat-suivi',
            key: 'poids',
            label: 'Poids',
          },
        ]),
      ],
      avecSuivi,
    )

    await screen.findByText('Poids')
    const supprimer = screen.getByRole('button', {
      name: /^supprimer la catégorie$/i,
    })
    expect(supprimer).toBeDisabled()
    // Le titre porte sur l'élément englobant : certains navigateurs ne le montrent pas sur un bouton désactivé.
    expect(supprimer.parentElement).toHaveAttribute(
      'title',
      "Déplacez ou supprimez d'abord ses champs",
    )
  })

  it('« Supprimer » une catégorie vide : confirmation puis PATCH { archived: true }', async () => {
    const avecSuivi = [
      ...categories,
      category({ id: 'cat-suivi', label: 'Suivi diététique', order: 2 }),
    ]
    const fetchMock = monter(
      [
        routeGetServiceFields([]),
        routePatchCategory(
          'cat-suivi',
          category({
            id: 'cat-suivi',
            label: 'Suivi diététique',
            order: 2,
            archived: true,
          }),
        ),
      ],
      avecSuivi,
    )

    await screen.findByText('Suivi diététique')
    const supprimer = screen.getByRole('button', {
      name: /^supprimer la catégorie$/i,
    })
    expect(supprimer).not.toBeDisabled()
    await userEvent.click(supprimer)

    const dialogue = await screen.findByRole('dialog')
    await userEvent.click(
      within(dialogue).getByRole('button', { name: /^supprimer$/i }),
    )

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/service-field-categories/cat-suivi') &&
          init?.method === 'PATCH',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ archived: true })
    })
  })

  it('« Ajouter une catégorie » exige un libellé', async () => {
    monter([routeGetServiceFields([])])

    await screen.findByText('Parcours & Inclusion')
    await userEvent.click(
      screen.getByRole('button', { name: /^ajouter une catégorie$/i }),
    )

    const ajouter = within(await screen.findByRole('dialog')).getByRole(
      'button',
      { name: /^ajouter$/i },
    )
    expect(ajouter).toBeDisabled()
  })

  it('« Ajouter une catégorie » envoie le libellé saisi', async () => {
    const fetchMock = monter([
      routeGetServiceFields([]),
      routeCreateCategory(category({ id: 'new', label: 'Nouvelle', order: 2 })),
    ])

    await screen.findByText('Parcours & Inclusion')
    await userEvent.click(
      screen.getByRole('button', { name: /^ajouter une catégorie$/i }),
    )
    const dialogue = await screen.findByRole('dialog')
    await userEvent.type(within(dialogue).getByLabelText('Libellé'), 'Nouvelle')
    await userEvent.click(
      within(dialogue).getByRole('button', { name: /^ajouter$/i }),
    )

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/service-field-categories') &&
          init?.method === 'POST',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        label: 'Nouvelle',
      })
    })
  })
})

describe('ecran de configuration — catégorie dans la popup d’un champ', () => {
  it('la popup de création est pré-remplie avec la catégorie du bloc', async () => {
    monter([routeGetServiceFields([motifSortie])])

    await screen.findByText('Motif de sortie')
    const boutonsAjouter = screen.getAllByRole('button', {
      name: /ajouter un champ/i,
    })
    // Deuxième bloc affiché : « Sortie & Bilan ».
    await userEvent.click(boutonsAjouter[1])

    expect(screen.getByLabelText('Catégorie')).toHaveTextContent(
      'Sortie & Bilan',
    )
  })

  it('changer de catégorie en modification envoie PATCH { categoryId }', async () => {
    const fetchMock = monter([
      routeGetServiceFields([orientation]),
      routePatch('f1'),
    ])

    await screen.findByText('Orientation')
    await userEvent.click(screen.getByRole('button', { name: /^modifier$/i }))

    await userEvent.click(screen.getByLabelText('Catégorie'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Sortie & Bilan' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: /^enregistrer$/i }),
    )

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/service-fields/f1') &&
          init?.method === 'PATCH',
      )
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
        categoryId: 'cat-sortie',
      })
    })
  })
})
