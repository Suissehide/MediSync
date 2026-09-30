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
import type { AuthState, User } from '@/types/auth.ts'
import { Route as serviceLayoutRoute } from '../../../$serviceId.tsx'
import { Route as accesRoute } from './acces.tsx'

dayjs.extend(utc)

// Même artefact d'environnement que `admin/services.test.tsx` /
// `admin/members.render.test.tsx` (front/CLAUDE.md, § Testing) :
// `ReactTable` virtualise ses lignes (`@tanstack/react-virtual`), qui mesure
// sous jsdom un conteneur de taille nulle et ne rend donc AUCUNE ligne. Tout
// test du CONTENU d'un tableau qui ne simule pas ce module est vrai par
// vacuité. Ce mock reprend exactement celui des deux fichiers cités.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        start: index * options.estimateSize(),
        end: (index + 1) * options.estimateSize(),
        size: options.estimateSize(),
      })),
    getTotalSize: () => options.count * options.estimateSize(),
    scrollToIndex: () => undefined,
    measure: () => undefined,
    measureElement: () => undefined,
  }),
}))

// Etape 4b, tâche 10 : journal des accès à un dossier, à l'échelle du
// service courant. Trois leçons déjà tirées ailleurs sur ce dépôt
// (front/CLAUDE.md, § Testing) verrouillées ici : chargement, erreur, vide,
// TOUJOURS distincts — un tableau vide indiscernable d'une panne a été livré
// deux fois, un « Chargement... » perpétuel une fois.

const optionsDe = (route: AnyRoute) => route.options

const coordinateur: User = {
  id: 'u1',
  email: 'coordo@b.fr',
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

const intervenant: User = {
  id: 'u2',
  email: 'interv@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [{ id: 's1', name: 'Cardio', role: 'INTERVENANT' }],
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
const accesScreenRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'patient/$patientID/acces',
  beforeLoad: optionsDe(accesRoute).beforeLoad,
  component: optionsDe(accesRoute).component,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    serviceRoute.addChildren([accesScreenRoute]),
  ]),
])

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

const URL_INITIALE = '/e/e1/s/s1/patient/p1/acces'

const monter = (routes: Route[], user: User = coordinateur) => {
  vi.stubGlobal('fetch', buildFetchMock(routes))
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [URL_INITIALE] }),
    context: { authState: { isAuthenticated: true, user } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// Enveloppe paginee depuis le 2026-10-01 : les tests d'ecran ci-dessous passent toujours des
// LIGNES, et ce helper les emballe — `total` valant leur nombre, la table n'affiche alors qu'une
// seule page, ce qui est bien ce que ces tests-la eprouvent. La pagination elle-meme est eprouvee
// a part, plus bas, avec un `total` plus grand que la page.
const routeGetAcces = (lignes: unknown[], total = lignes.length): Route => ({
  match: (url, method) => url.includes('/patient/p1/acces') && method === 'GET',
  respond: () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: lignes, total, page: 1, pageSize: 25 }),
  }),
})

const ligne = {
  id: 'log1',
  action: 'dossier.ouvert',
  createdAt: '2026-01-15T10:30:00.000Z',
  serviceId: 's1',
  userFirstName: 'Alice',
  userLastName: 'Martin',
  accesParOctroi: false,
}

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: coordinateur,
    context: null,
  })
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('etats de l ecran du journal des acces', () => {
  it('affiche un etat de chargement tant que la reponse n est pas arrivee', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(() => {
            // Ne se regle jamais.
          }),
      ),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [URL_INITIALE] }),
      context: { authState: { isAuthenticated: true, user: coordinateur } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(await screen.findByText(/chargement/i)).toBeInTheDocument()
    expect(screen.queryByText(/impossible de charger/i)).not.toBeInTheDocument()
  })

  it('affiche une erreur distincte, jamais un chargement perpetuel, sur une panne', async () => {
    monter([
      {
        match: (url, method) =>
          url.includes('/patient/p1/acces') && method === 'GET',
        respond: () => ({ ok: false, status: 500, json: async () => ({}) }),
      },
    ])

    await waitFor(() => {
      expect(
        screen.getByText(/impossible de charger le journal des accès/i),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText(/^chargement/i)).not.toBeInTheDocument()
  })

  it('affiche un etat vide distinct quand aucun acces n est enregistre', async () => {
    monter([routeGetAcces([])])

    await waitFor(() => {
      expect(
        screen.getByText(/aucun accès enregistré pour ce dossier/i),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText(/impossible de charger/i)).not.toBeInTheDocument()
  })

  it('affiche le contenu une fois la reponse arrivee : auteur, action, date, service', async () => {
    monter([routeGetAcces([ligne])])

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    })
    expect(screen.getByText('Dossier ouvert')).toBeInTheDocument()
    expect(screen.getByText('15/01/2026')).toBeInTheDocument()
    // Le service de la ligne, hors du fil d'Ariane de la barre qui nomme aussi « Cardio ».
    expect(
      within(screen.getByRole('main')).getByText('Cardio'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/chargement/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/impossible de charger/i)).not.toBeInTheDocument()
    // `accesParOctroi: false` (fixture `ligne`) : aucun badge, jamais un "Non" bruyant sur
    // chaque ligne normale (voir le commentaire de `columns/accessLog.column.tsx`).
    expect(screen.queryByText(/accès par octroi/i)).not.toBeInTheDocument()
  })

  // Tour de correction 1 (tâche 10) : `accesParOctroi` distingue un accès de dépannage (octroi
  // temporaire de super-admin) d'un accès de soin ordinaire — le point même de ce journal
  // d'audit. Une fixture où TOUTES les lignes portent la même valeur ne prouverait rien (la
  // pathologie du test vrai par vacuité, déjà mesurée sept fois sur ce dépôt) : celle-ci mélange
  // délibérément les deux, et lie chaque assertion à SA ligne — jamais une présence "quelque
  // part dans le document", le piège qui a déjà laissé passer un échange de libellés ailleurs
  // sur ce dépôt (`admin/services.test.tsx`, revue de la tâche 13).
  it("distingue un acces reel d'un acces par octroi, sans jamais les confondre", async () => {
    monter([
      routeGetAcces([
        {
          ...ligne,
          id: 'log-reel',
          userFirstName: 'Alice',
          userLastName: 'Martin',
          accesParOctroi: false,
        },
        {
          ...ligne,
          id: 'log-octroi',
          userFirstName: 'Super',
          userLastName: 'Admin',
          accesParOctroi: true,
        },
      ]),
    ])

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    })
    expect(screen.getByText('Super Admin')).toBeInTheDocument()

    const ligneReelle = screen.getByText('Alice Martin').closest('tr')
    const ligneOctroi = screen.getByText('Super Admin').closest('tr')
    expect(ligneReelle).not.toBeNull()
    expect(ligneOctroi).not.toBeNull()

    expect(ligneOctroi).toHaveTextContent(/accès par octroi/i)
    expect(ligneReelle).not.toHaveTextContent(/accès par octroi/i)

    // Une seule ligne porte le badge — pas une par ligne (ce ne serait plus une anomalie qui
    // saute aux yeux, mais une colonne banale de plus).
    expect(screen.getAllByText(/accès par octroi/i)).toHaveLength(1)
  })

  it('distingue les quatre actions du journal, jamais confondues entre elles', async () => {
    monter([
      routeGetAcces([
        { ...ligne, id: 'log1', action: 'dossier.ouvert' },
        { ...ligne, id: 'log2', action: 'sousDossier.ouvert' },
        { ...ligne, id: 'log3', action: 'echecsInscription.consultes' },
        { ...ligne, id: 'log4', action: 'export' },
      ]),
    ])

    await waitFor(() => {
      expect(screen.getByText('Dossier ouvert')).toBeInTheDocument()
    })
    expect(screen.getByText('Sous-dossier ouvert')).toBeInTheDocument()
    expect(
      screen.getByText("Échecs d'inscription consultés"),
    ).toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
  })

  // Le schéma de réponse (back, `patientAccessLogEntryResponseSchema`) ne rend jamais
  // `userFirstName`/`userLastName` quand ils sont `null` tous les deux : l'écran ne doit pas
  // planter, ni afficher "null null".
  it('degrade proprement l auteur quand aucun nom n est connu', async () => {
    monter([
      routeGetAcces([{ ...ligne, userFirstName: null, userLastName: null }]),
    ])

    await waitFor(() => {
      expect(screen.getByText('Dossier ouvert')).toBeInTheDocument()
    })
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('beforeLoad de l ecran du journal des acces — garde consultations:read', () => {
  const runBeforeLoad = (user: User) => {
    const beforeLoad = optionsDe(accesRoute).beforeLoad
    return beforeLoad?.({
      context: { authState: { isAuthenticated: true, user } },
      params: { establishmentId: 'e1', serviceId: 's1', patientID: 'p1' },
    } as never)
  }

  it('laisse passer un COORDINATEUR de service', () => {
    expect(() => runBeforeLoad(coordinateur)).not.toThrow()
  })

  it("refuse un INTERVENANT (n'a pas consultations:read), redirige vers le tableau de bord", () => {
    expect(() => runBeforeLoad(intervenant)).toThrow(
      expect.objectContaining({
        isRedirect: true,
        to: '/e/$establishmentId/s/$serviceId/dashboard',
      }),
    )
  })
})

// ------------------------------------------------------------------------------------------
// PAGINATION (2026-10-01) : cette lecture n'avait AUCUNE borne.
// ------------------------------------------------------------------------------------------
//
// Ni page, ni nombre de lignes : un dossier tres consulte rendait tout son journal d'une traite, et
// ce journal gagne une ligne a chaque ouverture du dossier. LE POINT DE CES TESTS EST QUE LA PAGE
// EST DEMANDEE AU SERVEUR — le bouchon honore `page`, donc un decoupage fait dans le navigateur, sur
// une page deja recue, ne les satisferait pas.
describe('pagination du journal des acces', () => {
  const monterPagine = () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(input.toString(), 'http://localhost')
      // Meme discipline que `buildFetchMock` plus haut : tout appel hors du journal echoue plutot
      // que de recevoir une reponse qui ne lui correspond pas — un bouchon universel repondait ici
      // l'enveloppe du journal a la requete des taches de la barre du haut, qui plantait dessus.
      if (!url.pathname.includes('/acces')) {
        throw new Error(
          `Appel fetch non attendu dans ce test : ${url.pathname}`,
        )
      }
      const page = Number(url.searchParams.get('page') ?? 1)
      return Promise.resolve({
        ok: true,
        status: 200,
        url: url.toString(),
        // Une ligne par page, reconnaissable a son auteur : c'est ce qui permet d'affirmer QUELLE
        // page est affichee. 120 au total, une valeur que la page ne porte jamais.
        json: async () => ({
          data: [{ ...ligne, id: `l${page}`, userFirstName: `Page${page}` }],
          total: 120,
          page,
          pageSize: Number(url.searchParams.get('pageSize') ?? 50),
        }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [URL_INITIALE] }),
      context: { authState: { isAuthenticated: true, user: coordinateur } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    const requetes = () =>
      fetchMock.mock.calls
        .map(([u]) => new URL(String(u), 'http://localhost'))
        .filter((u) => u.pathname.includes('/acces'))
    return { requetes }
  }

  const piedCharge = () =>
    screen.findByText('120 résultats', {}, { timeout: 3000 })

  it('demande la premiere page et affiche le total du serveur, pas la taille de la page recue', async () => {
    const { requetes } = monterPagine()

    expect(await piedCharge()).toBeInTheDocument()
    const derniere = requetes().at(-1)?.searchParams
    expect(derniere?.get('page')).toBe('1')
    expect(derniere?.get('pageSize')).toBe('25')
    // 120 lignes par pages de 25 : la 5e page est la derniere, jamais une 6e.
    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '6' })).not.toBeInTheDocument()
  })

  it('demande au SERVEUR la page choisie', async () => {
    const { requetes } = monterPagine()
    await piedCharge()

    await userEvent.click(screen.getByRole('button', { name: '3' }))

    await waitFor(() => {
      expect(requetes().at(-1)?.searchParams.get('page')).toBe('3')
    })
  })
})
