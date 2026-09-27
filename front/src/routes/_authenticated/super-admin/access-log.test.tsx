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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthState, User } from '@/types/auth.ts'
import type { EstablishmentListItem } from '@/types/superAdmin.ts'
import type { SuperAdminAccessLogEntry } from '@/types/superAdminAccessLog.ts'

import { Route as superAdminLayoutRoute } from '../super-admin.tsx'
import { Route as accessLogRoute } from './access-log.tsx'

dayjs.extend(utc)

// Même artefact d'environnement que `admin/services.test.tsx` / `patient/$patientID/acces.test.tsx`
// (front/CLAUDE.md, § Testing) : `ReactTable` virtualise ses lignes (`@tanstack/react-virtual`),
// qui mesure sous jsdom un conteneur de taille nulle et ne rend donc AUCUNE ligne. Tout test du
// CONTENU d'un tableau qui ne simule pas ce module est vrai par vacuité.
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

const optionsDe = (route: AnyRoute) => route.options

// Fixture OBLIGATOIRE (brief tâche 11) : un compte réellement dépourvu du drapeau, ET un compte
// qui le porte — avec un seul des deux, le test de discrétion ci-dessous ne comparerait rien
// (la pathologie mesurée huit fois sur ce dépôt, front/CLAUDE.md).
const superAdmin: User = {
  id: 'sa1',
  email: 'super@medisync.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: true,
  establishments: [],
}

const compteOrdinaire: User = {
  id: 'u1',
  email: 'membre@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    { id: 'e1', name: 'CHU', role: 'ADMIN', soignantId: null, services: [] },
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
// Le VRAI layout `/super-admin` : sa garde (`notFound()`, jamais une redirection) est celle du
// fichier — un correctif retiré là-bas redevient rouge ici, pas seulement dans une
// réimplémentation locale de la garde.
const superAdminLayoutRouteDeTest = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'super-admin',
  beforeLoad: optionsDe(superAdminLayoutRoute).beforeLoad,
  component: optionsDe(superAdminLayoutRoute).component,
})
// Le VRAI écran de cette tâche : aucun `beforeLoad` local (comme `index.tsx`/`users.tsx`) — la
// garde entière vient du parent.
const accessLogRouteDeTest = createRoute({
  getParentRoute: () => superAdminLayoutRouteDeTest,
  path: 'access-log',
  component: optionsDe(accessLogRoute).component,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    superAdminLayoutRouteDeTest.addChildren([accessLogRouteDeTest]),
  ]),
])

const monter = (user: User) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/super-admin/access-log'] }),
    context: { authState: { isAuthenticated: true, user } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const chu: EstablishmentListItem = {
  id: 'e1',
  name: 'CHU Bordeaux',
  createdAt: '2025-01-01T00:00:00.000Z',
  deactivatedAt: null,
  serviceCount: 1,
  accountCount: 1,
  patientCount: 1,
  firstAdmin: null,
  lastActivityAt: null,
}

const necker: EstablishmentListItem = {
  id: 'e2',
  name: 'Necker',
  createdAt: '2025-01-01T00:00:00.000Z',
  deactivatedAt: null,
  serviceCount: 1,
  accountCount: 1,
  patientCount: 1,
  firstAdmin: null,
  lastActivityAt: null,
}

const ligneAcces = (overrides: Partial<SuperAdminAccessLogEntry> = {}): SuperAdminAccessLogEntry => ({
  id: 'log1',
  source: 'acces',
  establishmentId: 'e1',
  serviceId: 's1',
  userID: 'u1',
  userFirstName: 'Alice',
  userLastName: 'Martin',
  action: 'dossier.ouvert',
  createdAt: '2026-01-15T10:30:00.000Z',
  entityType: null,
  entityID: null,
  patientId: 'p1',
  accesParOctroi: false,
  ...overrides,
})

type RouteMock = {
  match: (url: URL, method: string) => boolean
  respond: (url: URL) => Response
}

const buildFetchMock = (routes: RouteMock[]) =>
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString(), 'http://localhost')
    const method = init?.method ?? 'GET'
    const route = routes.find((r) => r.match(url, method))
    if (!route) {
      throw new Error(`Appel fetch non attendu dans ce test : ${method} ${url.toString()}`)
    }
    return Promise.resolve(route.respond(url))
  })

const routeEtablissements = (data: EstablishmentListItem[]): RouteMock => ({
  match: (url, method) => url.pathname.endsWith('/super-admin/establishments') && method === 'GET',
  respond: () => new Response(JSON.stringify(data), { status: 200 }),
})

const routeAccessLog = (data: SuperAdminAccessLogEntry[] | ((url: URL) => SuperAdminAccessLogEntry[])): RouteMock => ({
  match: (url, method) => url.pathname.endsWith('/super-admin/access-log') && method === 'GET',
  respond: (url) => new Response(JSON.stringify(typeof data === 'function' ? data(url) : data), { status: 200 }),
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("discretion de l'ecran plateforme du journal des acces", () => {
  it("un compte sans le drapeau isSuperAdmin ne voit ni entree de navigation ni le contenu de l'ecran (notFound, indiscernable d'une URL inconnue)", async () => {
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('Aucun appel fetch attendu : la garde doit refuser avant tout rendu.')
    }))

    monter(compteOrdinaire)

    // Le back rend 404, jamais 403 (`requireSuperAdmin`) : aucun `notFoundComponent` n'est
    // déclaré dans ce dépôt (front/CLAUDE.md, `__root.tsx`), donc TanStack Router rend son
    // "Not Found" par défaut — le même que pour une URL réellement inconnue.
    expect(await screen.findByText('Not Found')).toBeInTheDocument()

    expect(screen.queryByRole('heading', { name: 'Journal des accès' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Journal des accès' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Comptes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Établissements' })).not.toBeInTheDocument()
  })

  it("un compte AVEC le drapeau isSuperAdmin atteint reellement l'ecran, avec son entree de navigation", async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([routeEtablissements([]), routeAccessLog([])]),
    )

    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Journal des accès' })).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: 'Journal des accès' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Comptes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Établissements' })).toBeInTheDocument()
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument()
  })
})

describe("etats de l'ecran plateforme du journal des acces", () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', buildFetchMock([routeEtablissements([chu, necker]), routeAccessLog([])]))
  })

  it("affiche un etat de chargement distinct (ni erreur, ni vide) tant que la reponse n'est pas arrivee", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(input.toString(), 'http://localhost')
        if (url.pathname.endsWith('/super-admin/establishments')) {
          return Promise.resolve(new Response('[]', { status: 200 }))
        }
        // Le journal, lui, ne se règle jamais : la requête reste `isPending` indéfiniment.
        return new Promise<Response>(() => {
          // Ne se règle jamais.
        })
      }),
    )

    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Journal des accès' })).toBeInTheDocument()
    })
    // `ReactTable` rend des lignes squelettes (`animate-pulse`) tant que `isLoading` est vrai —
    // jamais l'état d'erreur, jamais l'état vide.
    await waitFor(() => {
      expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText(/impossible de charger/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/aucune entrée trouvée/i)).not.toBeInTheDocument()
  })

  it("affiche une erreur distincte, jamais un tableau vide, sur une panne", async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeEtablissements([]),
        {
          match: (url, method) => url.pathname.endsWith('/super-admin/access-log') && method === 'GET',
          respond: () => new Response(null, { status: 500 }),
        },
      ]),
    )

    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByText(/impossible de charger le journal de la plateforme/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/aucune entrée trouvée/i)).not.toBeInTheDocument()
  })

  it("affiche un etat vide distinct quand aucune entree n'est enregistree", async () => {
    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByText(/aucune entrée trouvée/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/impossible de charger/i)).not.toBeInTheDocument()
  })

  it("affiche le contenu une fois la reponse arrivee : compte, action, etablissement resolu", async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeEtablissements([chu, necker]),
        routeAccessLog([ligneAcces()]),
      ]),
    )

    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    })
    expect(screen.getByText('Dossier ouvert')).toBeInTheDocument()
    expect(screen.getByText('CHU Bordeaux')).toBeInTheDocument()
  })

  // Tour de correction 1 (tâche 10, reproduit ici) : `accesParOctroi` distingue un accès de
  // dépannage (octroi temporaire de super-admin) d'un accès de soin ordinaire — le point même de
  // CE journal-ci. Une fixture où TOUTES les lignes portent la même valeur ne prouverait rien :
  // celle-ci mélange délibérément les deux, et lie chaque assertion à SA ligne.
  it("distingue un acces reel d'un acces par octroi, sans jamais les confondre", async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeEtablissements([chu]),
        routeAccessLog([
          ligneAcces({ id: 'log-reel', userFirstName: 'Alice', userLastName: 'Martin', accesParOctroi: false }),
          ligneAcces({ id: 'log-octroi', userFirstName: 'Super', userLastName: 'Admin', accesParOctroi: true }),
        ]),
      ]),
    )

    monter(superAdmin)

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
    expect(screen.getAllByText(/accès par octroi/i)).toHaveLength(1)
  })

  // Les lignes du script d'amorçage (`establishmentId: null`) : la seule route qui peut les
  // lire (back, tâche 6/11) — elles doivent se distinguer explicitement, jamais une cellule vide
  // ambiguë qui se confondrait avec une erreur de résolution.
  it("rend distinctement les lignes du script d'amorcage (etablissement nul)", async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeEtablissements([chu]),
        routeAccessLog([
          ligneAcces({ id: 'log-amorcage', establishmentId: null, serviceId: null, userFirstName: null, userLastName: null }),
        ]),
      ]),
    )

    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByText(/amorçage/i)).toBeInTheDocument()
    })
  })

  // LE FILTRE NE S'ÉPROUVE QUE S'IL EXCLUT QUELQUE CHOSE (brief) : deux établissements, deux
  // lignes qui ne se recouvrent pas — sans quoi le test ne prouverait rien.
  it("le filtre etablissement exclut les lignes des autres etablissements", async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeEtablissements([chu, necker]),
        routeAccessLog((url) => {
          const establishmentId = url.searchParams.get('establishmentId')
          const toutes = [
            ligneAcces({ id: 'log-chu', establishmentId: 'e1', userFirstName: 'Alice', userLastName: 'Martin' }),
            ligneAcces({ id: 'log-necker', establishmentId: 'e2', userFirstName: 'Bob', userLastName: 'Durand' }),
          ]
          return establishmentId ? toutes.filter((l) => l.establishmentId === establishmentId) : toutes
        }),
      ]),
    )

    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    })
    expect(screen.getByText('Bob Durand')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Établissement'))
    await userEvent.click(await screen.findByRole('option', { name: 'CHU Bordeaux' }))

    await waitFor(() => {
      expect(screen.queryByText('Bob Durand')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
  })

  // Tour de correction 1 : ce cas manquait — sans lui, remplacer
  // `action: filtres.action || undefined` par `action: undefined` (le filtre jamais envoyé au
  // serveur, quel que soit le choix de l'utilisateur) laissait les onze tests d'alors tout
  // verts. Même discipline que le filtre établissement : deux lignes dont les actions ne se
  // recouvrent pas, la sélection de l'une fait disparaître l'autre.
  it("le filtre action exclut les lignes dont l'action ne correspond pas", async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeEtablissements([chu]),
        routeAccessLog((url) => {
          const action = url.searchParams.get('action')
          const toutes = [
            ligneAcces({ id: 'log-ouvert', action: 'dossier.ouvert', userFirstName: 'Alice', userLastName: 'Martin' }),
            ligneAcces({ id: 'log-export', action: 'export', userFirstName: 'Bob', userLastName: 'Durand' }),
          ]
          return action ? toutes.filter((l) => l.action === action) : toutes
        }),
      ]),
    )

    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    })
    expect(screen.getByText('Bob Durand')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Action'))
    await userEvent.click(await screen.findByRole('option', { name: 'Dossier ouvert' }))

    await waitFor(() => {
      expect(screen.queryByText('Bob Durand')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
  })

  // Le filtre « compte » (client, cf. le commentaire du fichier de route) doit lui aussi exclure
  // quelque chose pour prouver quelque chose.
  it("le filtre compte exclut les lignes des autres comptes", async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeEtablissements([chu]),
        routeAccessLog([
          ligneAcces({ id: 'log-alice', userFirstName: 'Alice', userLastName: 'Martin' }),
          ligneAcces({ id: 'log-bob', userFirstName: 'Bob', userLastName: 'Durand' }),
        ]),
      ]),
    )

    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    })
    expect(screen.getByText('Bob Durand')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Compte'), 'alice')

    await waitFor(() => {
      expect(screen.queryByText('Bob Durand')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
  })

  // Changer de journal réinitialise l'action (les deux ne partagent pas le même vocabulaire) et
  // affiche les libellés propres à `activite`, jamais ceux d'`acces`.
  it("changer de journal (source) affiche les libelles d'action de CE journal, et rappelle le serveur avec la nouvelle source", async () => {
    const fetchMock = buildFetchMock([
      routeEtablissements([chu]),
      routeAccessLog((url) => {
        if (url.searchParams.get('source') === 'activite') {
          return [
            {
              id: 'log-activite',
              source: 'activite',
              establishmentId: 'e1',
              serviceId: 's1',
              userID: 'u1',
              userFirstName: 'Alice',
              userLastName: 'Martin',
              action: 'patient.created',
              createdAt: '2026-01-15T10:30:00.000Z',
              entityType: 'patient',
              entityID: 'p1',
              patientId: null,
              accesParOctroi: null,
            },
          ]
        }
        return [ligneAcces()]
      }),
    ])
    vi.stubGlobal('fetch', fetchMock)

    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByText('Dossier ouvert')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByLabelText('Journal'))
    await userEvent.click(await screen.findByRole('option', { name: "Journal d'activité" }))

    await waitFor(() => {
      expect(screen.getByText('Patient créé')).toBeInTheDocument()
    })
    expect(screen.queryByText('Dossier ouvert')).not.toBeInTheDocument()

    const appelJournalActivite = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('source=activite'),
    )
    expect(appelJournalActivite).toBeDefined()
  })
})
