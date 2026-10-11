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
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { AuthState, User } from '@/types/auth.ts'
import type {
  ActivitySettings,
  Indicator,
  IndicatorSet,
  MeasureCatalogEntry,
} from '@/types/indicatorSet.ts'
import type { ServiceField } from '@/types/serviceField.ts'
import { Route as serviceLayoutRoute } from '../../$serviceId.tsx'
import { Route as indicateursRoute } from './indicateurs.tsx'

// La barre de navigation lit `dayjs.utc` ; `main.tsx`, qui enregistre le greffon, n'est pas chargé ici.
dayjs.extend(utc)

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
const ecranRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'indicateurs',
  beforeLoad: optionsDe(indicateursRoute).beforeLoad,
  component: optionsDe(indicateursRoute).component,
})
const dashboardRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'dashboard',
  component: () => <p>Tableau de bord</p>,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    serviceRoute.addChildren([ecranRoute, dashboardRoute]),
  ]),
])

const champ = (
  key: string,
  label: string,
  type: ServiceField['type'],
  choices: [string, string][] = [],
  archived = false,
): ServiceField => ({
  id: `f-${key}`,
  key,
  label,
  type,
  categoryId: 'cat-parcours',
  order: 0,
  clinical: false,
  unit: null,
  archived,
  choices: choices.map(([k, l], order) => ({
    id: `c-${k}`,
    key: k,
    label: l,
    order,
    archived: false,
  })),
})

const fields: ServiceField[] = [
  champ('orientation', 'Orientation', 'choice', [
    ['ext', 'Orientation pro santé ext hôpital'],
    ['dom', 'Domicile'],
  ]),
  champ('comorbidites', 'Comorbidités', 'multichoice', [['hta', 'HTA']]),
  champ('aDistance', 'Suivi à distance', 'boolean'),
  champ('age', 'Âge', 'number'),
  champ('entree', "Date d'entrée", 'date'),
  champ('commentaire', 'Commentaire', 'text'),
  champ('motif', "Motif d'arrêt", 'choice', [
    ['fin', 'Fin de parcours'],
    ['abandon', 'Abandon'],
  ]),
  champ('ancien', 'Ancienne orientation', 'choice', [['x', 'X']], true),
]

const catalog: MeasureCatalogEntry[] = [
  {
    key: 'patientsEntres',
    label: 'Patients entrés',
    description: 'Patients dont le parcours commence dans la période',
    unit: 'patients',
    options: [
      {
        name: 'diagnosticADistance',
        label: 'Diagnostic éducatif à distance',
        kind: 'boolean',
      },
    ],
  },
  {
    key: 'patientsParModalite',
    label: 'Patients par modalité',
    description: 'Patients selon la modalité',
    unit: 'patients',
    options: [
      {
        name: 'modalite',
        label: 'Modalité',
        kind: 'enum',
        choices: [
          { value: 'hospitalisation', label: 'Hospitalisation' },
          { value: 'externes', label: 'Externes' },
        ],
      },
    ],
  },
  {
    key: 'seancesIndividuelles',
    label: 'Séances individuelles',
    description: 'Séances individuelles réalisées',
    unit: 'seances',
    options: [],
  },
]

const indicateur = (
  id: string,
  order: number,
  rest: Partial<Indicator>,
): Indicator => ({
  id,
  code: id.toUpperCase(),
  label: `Libellé ${id}`,
  group: 'Activité',
  order,
  nature: 'computed',
  measure: null,
  options: null,
  filters: null,
  breakdownField: null,
  input: null,
  note: null,
  parentId: null,
  archived: false,
  ...rest,
})

const grille: IndicatorSet = {
  id: 'j1',
  name: 'Grille ARS',
  order: 0,
  archived: false,
  indicators: [
    indicateur('i1', 0, {
      label: 'Entrées hors hôpital',
      measure: 'patientsEntres',
      options: {},
      filters: [{ field: 'orientation', op: 'in', value: ['ext'] }],
    }),
    indicateur('i2', 1, { nature: 'manual', input: 'yesno', parentId: 'i1' }),
    indicateur('i3', 2, {
      group: 'Résultats',
      parentId: 'i2',
      nature: 'unavailable',
      note: 'Non suivi',
    }),
    indicateur('i4', 3, { archived: true, label: 'Ancien indicateur' }),
  ],
}
const qualite: IndicatorSet = {
  id: 'j2',
  name: 'Qualité',
  order: 1,
  archived: false,
  indicators: [],
}
const ancien: IndicatorSet = {
  id: 'j3',
  name: 'Ancien jeu',
  order: 2,
  archived: true,
  indicators: [],
}

type Reponse = { ok: boolean; status: number; json: () => Promise<unknown> }
type Route = {
  match: (url: string, method: string) => boolean
  respond: (body: unknown) => Reponse | Promise<Reponse>
}

const ok = (data: unknown): Reponse => ({
  ok: true,
  status: 200,
  json: async () => data,
})

const route = (
  method: string,
  fin: string,
  respond: Route['respond'] = () => ok({}),
): Route => ({
  match: (url, m) => m === method && new URL(url).pathname.endsWith(fin),
  respond,
})

const lecture = (
  sets: IndicatorSet[] = [grille, qualite, ancien],
  settings: ActivitySettings = {
    stopReasonFieldKey: null,
    completedChoiceKey: null,
  },
): Route[] => [
  route('GET', '/indicator-sets', () => ok(sets)),
  route('GET', '/indicator-catalog', () => ok(catalog)),
  route('GET', '/service-fields', () => ok(fields)),
  route('GET', '/activity-settings', () => ok(settings)),
  route('GET', '/todo', () => ok([])),
]

const monter = (routes: Route[]) => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      const method = init?.method ?? 'GET'
      const r = routes.find((x) => x.match(url, method))
      if (!r) {
        throw new Error(`Appel fetch non attendu : ${method} ${url}`)
      }
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      return { ...(await r.respond(body)), url }
    },
  )
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/e/e1/s/s1/indicateurs'],
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

const appels = (
  fetchMock: ReturnType<typeof monter>,
  method: string,
  fin: string,
) =>
  fetchMock.mock.calls
    .filter(
      ([url, init]) =>
        (init?.method ?? 'GET') === method &&
        new URL(String(url)).pathname.endsWith(fin),
    )
    .map(([, init]) => JSON.parse(String(init?.body)))

const ligneDuJeu = async (nom: string) => {
  const bouton = await screen.findByRole('button', {
    name: new RegExp(`^${nom}`),
  })
  const li = bouton.closest('li')
  if (!li) {
    throw new Error(`Ligne du jeu ${nom} introuvable`)
  }
  return within(li)
}

const ligneIndicateur = async (texte: string) => {
  const li = (await screen.findByText(texte, { exact: false })).closest('li')
  if (!li) {
    throw new Error(`Ligne ${texte} introuvable`)
  }
  return within(li)
}

const choisir = async (label: string | RegExp, option: string | RegExp) => {
  await userEvent.click(screen.getByLabelText(label))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

const ouvrirAjout = async () => {
  await userEvent.click(
    await screen.findByRole('button', { name: /ajouter un indicateur/i }),
  )
  return screen.findByRole('dialog')
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
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

describe('garde', () => {
  it('renvoie au tableau de bord un role sans stats:write', async () => {
    const intervenant: User = {
      ...user,
      establishments: [
        {
          ...user.establishments[0],
          services: [{ id: 's1', name: 'Cardio', role: 'INTERVENANT' }],
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn())
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/e/e1/s/s1/indicateurs'],
      }),
      context: { authState: { isAuthenticated: true, user: intervenant } },
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Tableau de bord')).toBeInTheDocument()
  })
})

describe('liste des jeux', () => {
  it('montre les jeux actifs, pas les supprimés', async () => {
    monter(lecture())
    await ligneDuJeu('Grille ARS')
    expect(screen.getByRole('button', { name: /^Qualité/ })).toBeVisible()
    expect(screen.queryByText('Ancien jeu')).not.toBeInTheDocument()
  })

  it('cree un jeu', async () => {
    const fetchMock = monter([
      ...lecture(),
      route('POST', '/indicator-sets', () => ok(qualite)),
    ])
    await userEvent.click(
      await screen.findByRole('button', { name: /nouveau jeu/i }),
    )
    await userEvent.type(screen.getByLabelText('Nom'), 'Qualité de vie')
    await userEvent.click(screen.getByRole('button', { name: /^créer$/i }))
    await waitFor(() =>
      expect(appels(fetchMock, 'POST', '/indicator-sets')).toEqual([
        { name: 'Qualité de vie' },
      ]),
    )
  })

  it('renomme un jeu', async () => {
    const fetchMock = monter([
      ...lecture(),
      route('PATCH', '/indicator-sets/j1', () => ok(grille)),
    ])
    const ligne = await ligneDuJeu('Grille ARS')
    await userEvent.click(ligne.getByRole('button', { name: /renommer/i }))
    const nom = screen.getByLabelText('Nom')
    expect(nom).toHaveValue('Grille ARS')
    await userEvent.clear(nom)
    await userEvent.type(nom, 'Grille 2027')
    await userEvent.click(
      screen.getByRole('button', { name: /^enregistrer$/i }),
    )
    await waitFor(() =>
      expect(appels(fetchMock, 'PATCH', '/indicator-sets/j1')).toEqual([
        { name: 'Grille 2027' },
      ]),
    )
  })

  it('supprime un jeu apres confirmation, restaurable depuis Supprimés', async () => {
    const fetchMock = monter([
      ...lecture(),
      route('PATCH', '/indicator-sets/j1', () => ok(grille)),
    ])
    const ligne = await ligneDuJeu('Grille ARS')
    await userEvent.click(ligne.getByRole('button', { name: /^supprimer$/i }))
    const dialogue = await screen.findByRole('dialog')
    expect(dialogue).toHaveTextContent('restaurable depuis « Supprimés »')
    expect(appels(fetchMock, 'PATCH', '/indicator-sets/j1')).toEqual([])
    await userEvent.click(
      within(dialogue).getByRole('button', { name: /^supprimer$/i }),
    )
    await waitFor(() =>
      expect(appels(fetchMock, 'PATCH', '/indicator-sets/j1')).toEqual([
        { archived: true },
      ]),
    )
  })

  it('restaure un jeu supprimé', async () => {
    const fetchMock = monter([
      ...lecture(),
      route('PATCH', '/indicator-sets/j3', () => ok(ancien)),
    ])
    await ligneDuJeu('Grille ARS')
    await userEvent.click(screen.getByLabelText('Supprimés'))
    const ligne = await ligneDuJeu('Ancien jeu')
    await userEvent.click(ligne.getByRole('button', { name: /^restaurer$/i }))
    await waitFor(() =>
      expect(appels(fetchMock, 'PATCH', '/indicator-sets/j3')).toEqual([
        { archived: false },
      ]),
    )
  })

  it('la fleche descendre envoie le jeu complet, supprimés compris', async () => {
    const fetchMock = monter([
      ...lecture(),
      route('PUT', '/indicator-sets/order'),
    ])
    const ligne = await ligneDuJeu('Grille ARS')
    expect(ligne.getByRole('button', { name: 'Monter' })).toBeDisabled()
    await userEvent.click(ligne.getByRole('button', { name: 'Descendre' }))
    await waitFor(() =>
      expect(appels(fetchMock, 'PUT', '/indicator-sets/order')).toEqual([
        { ids: ['j2', 'j1', 'j3'] },
      ]),
    )
  })

  it('deux clics rapides sur Descendre n envoient qu un reordonnancement', async () => {
    let liberer: () => void = () => undefined
    const enAttente = new Promise<void>((resolve) => {
      liberer = resolve
    })
    const fetchMock = monter([
      ...lecture(),
      route('PUT', '/indicator-sets/order', () => enAttente.then(() => ok({}))),
    ])
    const ligne = await ligneDuJeu('Grille ARS')
    const descendre = ligne.getByRole('button', { name: 'Descendre' })
    await userEvent.click(descendre)
    await userEvent.click(descendre)
    liberer()
    await waitFor(() =>
      expect(appels(fetchMock, 'PUT', '/indicator-sets/order')).toHaveLength(1),
    )
  })

  it('deux clics rapides sur Créer ne creent qu un jeu', async () => {
    let liberer: () => void = () => undefined
    const enAttente = new Promise<void>((resolve) => {
      liberer = resolve
    })
    const fetchMock = monter([
      ...lecture(),
      route('POST', '/indicator-sets', () => enAttente.then(() => ok(qualite))),
    ])
    await userEvent.click(
      await screen.findByRole('button', { name: /nouveau jeu/i }),
    )
    await userEvent.type(screen.getByLabelText('Nom'), 'Qualité de vie')
    const creer = screen.getByRole('button', { name: /^créer$/i })
    await userEvent.click(creer)
    await userEvent.click(creer)
    liberer()
    await waitFor(() =>
      expect(appels(fetchMock, 'POST', '/indicator-sets')).toHaveLength(1),
    )
  })
})

describe('un jeu', () => {
  it('restaure un indicateur supprimé d un jeu actif', async () => {
    const fetchMock = monter([
      ...lecture(),
      route('PATCH', '/indicator-sets/j1/indicators/i4', () => ok({})),
    ])
    await ligneDuJeu('Grille ARS')
    await userEvent.click(screen.getByLabelText('Supprimés'))
    const ligne = await ligneIndicateur('Ancien indicateur')
    await userEvent.click(ligne.getByRole('button', { name: /^restaurer$/i }))
    await waitFor(() =>
      expect(
        appels(fetchMock, 'PATCH', '/indicator-sets/j1/indicators/i4'),
      ).toEqual([{ archived: false }]),
    )
  })

  it('range les indicateurs par groupe avec un resume lisible', async () => {
    monter(lecture())
    expect(
      await screen.findByText(
        'Patients entrés · Orientation parmi Orientation pro santé ext hôpital',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Activité' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Résultats' })).toBeVisible()
    expect(screen.getByText('Réponse : Oui / Non')).toBeInTheDocument()
    expect(screen.getByText('Non suivi')).toBeInTheDocument()
    expect(screen.queryByText(/Ancien indicateur/)).not.toBeInTheDocument()
  })

  it('les fleches d un indicateur envoient tous les identifiants du jeu, supprimés compris', async () => {
    const fetchMock = monter([
      ...lecture(),
      route('PUT', '/indicator-sets/j1/indicators/order'),
    ])
    const ligne = await ligneIndicateur('Entrées hors hôpital')
    await userEvent.click(ligne.getByRole('button', { name: 'Descendre' }))
    await waitFor(() =>
      expect(
        appels(fetchMock, 'PUT', '/indicator-sets/j1/indicators/order'),
      ).toEqual([{ ids: ['i2', 'i1', 'i3', 'i4'] }]),
    )
  })

  it('supprime un indicateur apres confirmation', async () => {
    const fetchMock = monter([
      ...lecture(),
      route('PATCH', '/indicator-sets/j1/indicators/i2', () => ok({})),
    ])
    const ligne = await ligneIndicateur('Libellé i2')
    await userEvent.click(ligne.getByRole('button', { name: /^supprimer$/i }))
    const dialogue = await screen.findByRole('dialog')
    expect(dialogue).toHaveTextContent('restaurable depuis « Supprimés »')
    await userEvent.click(
      within(dialogue).getByRole('button', { name: /^supprimer$/i }),
    )
    await waitFor(() =>
      expect(
        appels(fetchMock, 'PATCH', '/indicator-sets/j1/indicators/i2'),
      ).toEqual([{ archived: true }]),
    )
  })
})

describe('popup d un indicateur', () => {
  it('le parent exclut l indicateur et ses descendants', async () => {
    monter(lecture())
    const ligne = await ligneIndicateur('Libellé i2')
    await userEvent.click(ligne.getByRole('button', { name: /^modifier$/i }))
    await userEvent.click(await screen.findByLabelText(/Parent/))
    const options = (await screen.findAllByRole('option')).map(
      (o) => o.textContent,
    )
    expect(options).toEqual(['I1 · Entrées hors hôpital'])
  })

  it('la répartition garde son champ même supprimé', async () => {
    monter([
      ...lecture([
        {
          ...grille,
          indicators: [
            indicateur('i9', 0, {
              measure: 'patientsEntres',
              options: {},
              breakdownField: 'ancien',
            }),
          ],
        },
      ]),
      route('POST', '/indicator-sets/j1/preview', () =>
        ok({ value: 1, breakdown: null, warnings: [] }),
      ),
    ])
    const ligne = await ligneIndicateur('Libellé i9')
    await userEvent.click(ligne.getByRole('button', { name: /^modifier$/i }))
    await userEvent.click(await screen.findByLabelText(/Répartition/))
    const options = (await screen.findAllByRole('option')).map(
      (o) => o.textContent,
    )
    expect(options).toContain('Ancienne orientation')
  })

  it('calcule : mesure avec description, options du catalogue selon leur type', async () => {
    monter(lecture())
    await ouvrirAjout()
    await choisir('Mesure', 'Patients entrés')
    expect(
      screen.getByText('Patients dont le parcours commence dans la période'),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('Diagnostic éducatif à distance'),
    ).toHaveAttribute('type', 'checkbox')

    await choisir('Mesure', 'Patients par modalité')
    await userEvent.click(screen.getByLabelText('Modalité'))
    expect(
      await screen.findByRole('option', { name: 'Hospitalisation' }),
    ).toBeInTheDocument()
  })

  it('à saisir : type de réponse ; non disponible : note', async () => {
    monter(lecture())
    await ouvrirAjout()
    await choisir('Nature', 'À saisir')
    expect(screen.getByLabelText('Type de réponse')).toBeInTheDocument()
    expect(screen.queryByLabelText('Mesure')).not.toBeInTheDocument()
    await choisir('Nature', 'Non disponible')
    expect(screen.getByLabelText('Note')).toBeInTheDocument()
    expect(screen.queryByLabelText('Type de réponse')).not.toBeInTheDocument()
  })

  it('la répartition n est proposée que pour une mesure de patients, parmi les champs à choix', async () => {
    monter(lecture())
    await ouvrirAjout()
    await choisir('Mesure', 'Séances individuelles')
    expect(screen.queryByLabelText(/Répartition/)).not.toBeInTheDocument()
    await choisir('Mesure', 'Patients entrés')
    await userEvent.click(screen.getByLabelText(/Répartition/))
    const options = (await screen.findAllByRole('option')).map(
      (o) => o.textContent,
    )
    expect(options).toEqual(['Orientation', 'Comorbidités', "Motif d'arrêt"])
  })

  it('cree un indicateur calculé avec sa définition complète', async () => {
    const fetchMock = monter([
      ...lecture(),
      route('POST', '/indicator-sets/j1/preview', () =>
        ok({ value: 3, breakdown: null, warnings: [] }),
      ),
      route('POST', '/indicator-sets/j1/indicators', () => ok({})),
    ])
    const dialogue = await ouvrirAjout()
    await userEvent.type(within(dialogue).getByLabelText('Code'), 'A1')
    await userEvent.type(within(dialogue).getByLabelText('Libellé'), 'Entrées')
    await userEvent.type(within(dialogue).getByLabelText('Groupe'), 'Activité')
    await choisir('Mesure', 'Patients entrés')
    await userEvent.click(
      screen.getByLabelText('Diagnostic éducatif à distance'),
    )
    await choisir(/Répartition/, 'Orientation')
    await userEvent.click(screen.getByRole('button', { name: /^ajouter$/i }))
    await waitFor(() =>
      expect(
        appels(fetchMock, 'POST', '/indicator-sets/j1/indicators'),
      ).toEqual([
        {
          code: 'A1',
          label: 'Entrées',
          group: 'Activité',
          parentId: null,
          nature: 'computed',
          measure: 'patientsEntres',
          options: { diagnosticADistance: true },
          filters: [],
          breakdownField: 'orientation',
          input: null,
          note: null,
        },
      ]),
    )
  })
})

describe('éditeur de filtres', () => {
  const ajouterFiltre = async () => {
    await ouvrirAjout()
    await userEvent.click(
      screen.getByRole('button', { name: /ajouter un filtre/i }),
    )
  }

  it('ne propose pas les champs texte', async () => {
    monter(lecture())
    await ajouterFiltre()
    await userEvent.click(screen.getByLabelText('Champ'))
    const options = (await screen.findAllByRole('option')).map(
      (o) => o.textContent,
    )
    expect(options).toEqual([
      'Orientation',
      'Comorbidités',
      'Suivi à distance',
      'Âge',
      "Date d'entrée",
      "Motif d'arrêt",
    ])
  })

  it('choix : une case par choix', async () => {
    monter(lecture())
    await ajouterFiltre()
    expect(
      screen.getByRole('checkbox', {
        name: 'Orientation pro santé ext hôpital',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Domicile' })).toBeVisible()
  })

  it('nombre : les cinq comparaisons et un champ numérique', async () => {
    monter(lecture())
    await ajouterFiltre()
    await choisir('Champ', 'Âge')
    expect(screen.getByRole('spinbutton', { name: 'Valeur' })).toBeVisible()
    await userEvent.click(screen.getByLabelText('Opérateur'))
    const options = (await screen.findAllByRole('option')).map(
      (o) => o.textContent,
    )
    expect(options).toEqual(['=', '<', '≤', '>', '≥'])
  })

  it('date : avant le / après le et un champ date', async () => {
    monter(lecture())
    await ajouterFiltre()
    await choisir('Champ', "Date d'entrée")
    expect(screen.getByLabelText('Date')).toHaveAttribute('type', 'date')
    await userEvent.click(screen.getByLabelText('Opérateur'))
    const options = (await screen.findAllByRole('option')).map(
      (o) => o.textContent,
    )
    expect(options).toEqual(['avant le', 'après le'])
  })

  it('booléen : Oui / Non', async () => {
    monter(lecture())
    await ajouterFiltre()
    await choisir('Champ', 'Suivi à distance')
    await userEvent.click(screen.getByLabelText('Valeur'))
    const options = (await screen.findAllByRole('option')).map(
      (o) => o.textContent,
    )
    expect(options).toEqual(['Oui', 'Non'])
  })
})

describe('aperçu', () => {
  it('affiche la valeur de l année après un délai, et la recalcule à la modification', async () => {
    const corps: unknown[] = []
    const fetchMock = monter([
      ...lecture(),
      route('POST', '/indicator-sets/j1/preview', (body) => {
        corps.push(body)
        return ok({ value: corps.length * 10, breakdown: null, warnings: [] })
      }),
    ])
    await ouvrirAjout()
    await choisir('Mesure', 'Patients entrés')
    const annee = new Date().getFullYear()
    expect(
      await screen.findByText(`Valeur sur ${annee} : 10`, undefined, {
        timeout: 2000,
      }),
    ).toBeInTheDocument()
    expect(corps[0]).toEqual({
      indicator: {
        nature: 'computed',
        measure: 'patientsEntres',
        options: {},
        filters: [],
        breakdownField: null,
        input: null,
        note: null,
      },
      from: `${annee}-01-01`,
      to: `${annee}-12-31`,
    })

    await userEvent.click(
      screen.getByLabelText('Diagnostic éducatif à distance'),
    )
    expect(
      await screen.findByText(`Valeur sur ${annee} : 20`, undefined, {
        timeout: 2000,
      }),
    ).toBeInTheDocument()
    expect(appels(fetchMock, 'POST', '/preview')).toHaveLength(2)
  })

  it('sur un 400, affiche « Configuration incomplète » sans toast', async () => {
    monter([
      ...lecture(),
      route('POST', '/indicator-sets/j1/preview', () => ({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Mesure manquante' }),
      })),
    ])
    await ouvrirAjout()
    expect(
      await screen.findByText('Configuration incomplète', undefined, {
        timeout: 2000,
      }),
    ).toBeInTheDocument()
    expect(useToastStore.getState().toasts).toEqual([])
  })

  // Le back refuse une valeur de filtre absente (le NaN part en null) : vider le nombre ne filtre pas « = 0 ».
  it('un nombre vidé laisse le filtre incomplet', async () => {
    const corps: unknown[] = []
    monter([
      ...lecture(),
      route('POST', '/indicator-sets/j1/preview', (body) => {
        corps.push(body)
        return JSON.stringify(body).includes('"value":null')
          ? { ok: false, status: 400, json: async () => ({}) }
          : ok({ value: 1, breakdown: null, warnings: [] })
      }),
    ])
    await ouvrirAjout()
    await choisir('Mesure', 'Patients entrés')
    await userEvent.click(
      screen.getByRole('button', { name: /ajouter un filtre/i }),
    )
    await choisir('Champ', 'Âge')
    await userEvent.clear(screen.getByRole('spinbutton', { name: 'Valeur' }))
    expect(
      await screen.findByText('Configuration incomplète', undefined, {
        timeout: 2000,
      }),
    ).toBeInTheDocument()
    expect(corps.at(-1)).toMatchObject({
      indicator: { filters: [{ field: 'age', op: 'eq', value: null }] },
    })
    expect(screen.getByRole('spinbutton', { name: 'Valeur' })).toHaveValue(null)
  })
})

describe('aperçu indisponible', () => {
  it('une erreur autre que 400 ne se lit pas comme une configuration incomplète', async () => {
    monter([
      ...lecture(),
      route('POST', '/indicator-sets/j1/preview', () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      })),
    ])
    await ouvrirAjout()
    expect(
      await screen.findByText('Aperçu indisponible', undefined, {
        timeout: 2000,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Configuration incomplète')).toBeNull()
  })
})

describe('réglages de l Activité', () => {
  it('champ parmi les champs à choix, puis valeur parmi ses choix ; enregistre', async () => {
    const fetchMock = monter([
      ...lecture(),
      route('PATCH', '/activity-settings', (body) => ok(body)),
    ])
    await screen.findByText("Réglages de l'Activité")
    expect(screen.getByLabelText('Valeur « fin de parcours »')).toBeDisabled()
    await userEvent.click(screen.getByLabelText("Champ motif d'arrêt"))
    const options = (await screen.findAllByRole('option')).map(
      (o) => o.textContent,
    )
    expect(options).toEqual(['Orientation', "Motif d'arrêt"])
    await userEvent.click(screen.getByRole('option', { name: "Motif d'arrêt" }))
    await choisir('Valeur « fin de parcours »', 'Fin de parcours')
    await userEvent.click(
      screen.getByRole('button', { name: /enregistrer les réglages/i }),
    )
    await waitFor(() =>
      expect(appels(fetchMock, 'PATCH', '/activity-settings')).toEqual([
        { stopReasonFieldKey: 'motif', completedChoiceKey: 'fin' },
      ]),
    )
  })

  it('explique qu un réglage incomplet masque le bloc', async () => {
    monter(lecture())
    expect(
      await screen.findByText(/un seul ne suffit pas, le bloc reste masqué/),
    ).toBeInTheDocument()
  })
})
