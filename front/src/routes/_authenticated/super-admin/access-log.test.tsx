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

import { useAuthStore } from '@/store/useAuthStore.ts'
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
  establishments: [{ id: 'e1', name: 'CHU', role: 'ADMIN', services: [] }],
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
  // Navigation par echelle (2026-09-28) : les onglets de la plateforme viennent de la barre du
  // haut (`navbar.tsx`), qui lit le compte dans le store, et non plus d'un bandeau dans la page.
  useAuthStore.setState({ user })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/super-admin/access-log'],
    }),
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

const ligneAcces = (
  overrides: Partial<SuperAdminAccessLogEntry> = {},
): SuperAdminAccessLogEntry => ({
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
      throw new Error(
        `Appel fetch non attendu dans ce test : ${method} ${url.toString()}`,
      )
    }
    return Promise.resolve(route.respond(url))
  })

const routeEtablissements = (data: EstablishmentListItem[]): RouteMock => ({
  match: (url, method) =>
    url.pathname.endsWith('/super-admin/establishments') && method === 'GET',
  respond: () => new Response(JSON.stringify(data), { status: 200 }),
})

// ENVELOPPE PAGINEE depuis le 2026-10-01 (§8 de `docs/multi-tenant/decisions-etape-4b.md`, fermee
// ce jour-la) : les tests ci-dessous continuent de decrire des LIGNES, ce helper les emballe. Par
// defaut `total` vaut leur nombre — une seule page, ce qu'eprouvent les tests de filtres et de
// colonnes. `total` est surchargeable pour les tests de pagination, ou il DOIT differer de la
// longueur de la page : c'est la seule facon de distinguer « le total » de « ce que la page
// contient », et une fixture ou les deux coincident ne prouverait rien de la derniere page.
const routeAccessLog = (
  data: SuperAdminAccessLogEntry[] | ((url: URL) => SuperAdminAccessLogEntry[]),
  total?: number,
): RouteMock => ({
  match: (url, method) =>
    url.pathname.endsWith('/super-admin/access-log') && method === 'GET',
  respond: (url) => {
    const lignes = typeof data === 'function' ? data(url) : data
    return new Response(
      JSON.stringify({
        data: lignes,
        total: total ?? lignes.length,
        page: Number(url.searchParams.get('page') ?? 1),
        pageSize: Number(url.searchParams.get('pageSize') ?? 25),
      }),
      { status: 200 },
    )
  },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("discretion de l'ecran plateforme du journal des acces", () => {
  it("un compte sans le drapeau isSuperAdmin ne voit ni entree de navigation ni le contenu de l'ecran (notFound, indiscernable d'une URL inconnue)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error(
          'Aucun appel fetch attendu : la garde doit refuser avant tout rendu.',
        )
      }),
    )

    monter(compteOrdinaire)

    // Le back rend 404, jamais 403 (`requireSuperAdmin`) : aucun `notFoundComponent` n'est
    // déclaré dans ce dépôt (front/CLAUDE.md, `__root.tsx`), donc TanStack Router rend son
    // "Not Found" par défaut — le même que pour une URL réellement inconnue.
    expect(await screen.findByText('Not Found')).toBeInTheDocument()

    expect(
      screen.queryByRole('heading', { name: 'Journaux' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Journaux' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Comptes' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Établissements' }),
    ).not.toBeInTheDocument()
  })

  it("un compte AVEC le drapeau isSuperAdmin atteint reellement l'ecran, avec son entree de navigation", async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([routeEtablissements([]), routeAccessLog([])]),
    )

    monter(superAdmin)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Journaux' }),
      ).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: 'Journaux' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Comptes' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Établissements' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument()
  })
})

describe("etats de l'ecran plateforme du journal des acces", () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([routeEtablissements([chu, necker]), routeAccessLog([])]),
    )
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
      expect(
        screen.getByRole('heading', { name: 'Journaux' }),
      ).toBeInTheDocument()
    })
    // `ReactTable` rend des lignes squelettes (`animate-pulse`) tant que `isLoading` est vrai —
    // jamais l'état d'erreur, jamais l'état vide.
    await waitFor(() => {
      expect(
        document.querySelectorAll('.animate-pulse').length,
      ).toBeGreaterThan(0)
    })
    expect(screen.queryByText(/impossible de charger/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/aucune entrée trouvée/i)).not.toBeInTheDocument()
  })

  it('affiche une erreur distincte, jamais un tableau vide, sur une panne', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeEtablissements([]),
        {
          match: (url, method) =>
            url.pathname.endsWith('/super-admin/access-log') &&
            method === 'GET',
          respond: () => new Response(null, { status: 500 }),
        },
      ]),
    )

    monter(superAdmin)

    await waitFor(() => {
      expect(
        screen.getByText(/impossible de charger le journal de la plateforme/i),
      ).toBeInTheDocument()
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

  it('affiche le contenu une fois la reponse arrivee : compte, action, etablissement resolu', async () => {
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
          ligneAcces({
            id: 'log-reel',
            userFirstName: 'Alice',
            userLastName: 'Martin',
            accesParOctroi: false,
          }),
          ligneAcces({
            id: 'log-octroi',
            userFirstName: 'Super',
            userLastName: 'Admin',
            accesParOctroi: true,
          }),
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
          ligneAcces({
            id: 'log-amorcage',
            establishmentId: null,
            serviceId: null,
            userFirstName: null,
            userLastName: null,
          }),
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
  it('le filtre etablissement exclut les lignes des autres etablissements', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeEtablissements([chu, necker]),
        routeAccessLog((url) => {
          const establishmentId = url.searchParams.get('establishmentId')
          const toutes = [
            ligneAcces({
              id: 'log-chu',
              establishmentId: 'e1',
              userFirstName: 'Alice',
              userLastName: 'Martin',
            }),
            ligneAcces({
              id: 'log-necker',
              establishmentId: 'e2',
              userFirstName: 'Bob',
              userLastName: 'Durand',
            }),
          ]
          return establishmentId
            ? toutes.filter((l) => l.establishmentId === establishmentId)
            : toutes
        }),
      ]),
    )

    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    })
    expect(screen.getByText('Bob Durand')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Établissement'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'CHU Bordeaux' }),
    )

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
            ligneAcces({
              id: 'log-ouvert',
              action: 'dossier.ouvert',
              userFirstName: 'Alice',
              userLastName: 'Martin',
            }),
            ligneAcces({
              id: 'log-export',
              action: 'export',
              userFirstName: 'Bob',
              userLastName: 'Durand',
            }),
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
    await userEvent.click(
      await screen.findByRole('option', { name: 'Dossier ouvert' }),
    )

    await waitFor(() => {
      expect(screen.queryByText('Bob Durand')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
  })

  // REVUE FINALE DE BRANCHE, Important n°1 — LE FILTRE « COMPTE » EST SERVEUR, ET CES DEUX CAS
  // NE PEUVENT PAS ETRE SATISFAITS PAR UN FILTRE NAVIGATEUR.
  //
  // L'ancien cas donnait au bouchon les MEMES deux lignes quelle que soit la requete, et
  // verifiait que Bob disparaissait : un filtre navigateur le satisfaisait, et c'est bien ce qui
  // se passait — sur la page DEJA TRONQUEE a 200 lignes. Les deux cas ci-dessous inversent la
  // charge de la preuve : le bouchon honore `compte`, donc ne rien envoyer laisse Bob a l'ecran.
  it('le filtre compte est envoye au SERVEUR (un filtre navigateur ne le satisferait pas)', async () => {
    const fetchMock = buildFetchMock([
      routeEtablissements([chu]),
      routeAccessLog((url) => {
        const compte = url.searchParams.get('compte')
        const toutes = [
          ligneAcces({
            id: 'log-alice',
            userFirstName: 'Alice',
            userLastName: 'Martin',
          }),
          ligneAcces({
            id: 'log-bob',
            userFirstName: 'Bob',
            userLastName: 'Durand',
          }),
        ]
        if (compte === null) {
          return toutes
        }
        const fragment = compte.toLowerCase()
        return toutes.filter((l) =>
          `${l.userFirstName} ${l.userLastName}`
            .toLowerCase()
            .includes(fragment),
        )
      }),
    ])
    vi.stubGlobal('fetch', fetchMock)

    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    })
    expect(screen.getByText('Bob Durand')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Compte'), 'alice')

    // Les deux assertions dans le MEME `waitFor` : la saisie est differee puis relance la
    // requete, et pendant ce rechargement `ReactTable` rend des squelettes — aucune des deux
    // lignes n'est alors a l'ecran, un etat transitoire qu'une assertion isolee sur l'absence de
    // Bob prendrait pour le resultat.
    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument()
      expect(screen.queryByText('Bob Durand')).not.toBeInTheDocument()
    })
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('compte=alice'),
      ),
    ).toBe(true)
  })

  // LE DEFAUT LUI-MEME, REJOUE. La lecture plateforme est bornee a 200 lignes en `createdAt
  // desc` : les lignes plus anciennes d'un compte n'apparaissent JAMAIS dans la reponse non
  // filtree. Le bouchon reproduit exactement cela — Zoe n'est rendue QUE lorsque `compte` est
  // envoye. Un filtre navigateur, qui ne peut que reduire la page recue, rendrait ici « aucune
  // entree » alors que les lignes existent : c'est le constat de la revue, mot pour mot.
  it('trouve un compte dont les lignes sont HORS de la page non filtree (ce que le filtre navigateur ne pouvait pas)', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeEtablissements([chu]),
        routeAccessLog((url) => {
          const compte = url.searchParams.get('compte')
          if (compte === null) {
            // La « page » des 200 dernieres lignes : Zoe n'y est pas, elle est trop ancienne.
            return [
              ligneAcces({
                id: 'log-alice',
                userFirstName: 'Alice',
                userLastName: 'Martin',
              }),
            ]
          }
          return compte.toLowerCase() === 'zoe'
            ? [
                ligneAcces({
                  id: 'log-zoe',
                  userFirstName: 'Zoe',
                  userLastName: 'Ancienne',
                }),
              ]
            : []
        }),
      ]),
    )

    monter(superAdmin)

    await waitFor(() => {
      expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    })
    expect(screen.queryByText('Zoe Ancienne')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Compte'), 'zoe')

    await waitFor(() => {
      expect(screen.getByText('Zoe Ancienne')).toBeInTheDocument()
    })
  })

  // REVUE FINALE DE BRANCHE, Important n°1 — VISER LES LIGNES SANS ETABLISSEMENT. Sans cette
  // option, les lignes du script d'amorcage (les plus ANCIENNES de la table, donc les premieres
  // a tomber hors de la page de 200) ne sont visables par aucun filtre : la liste deroulante ne
  // proposait que des etablissements REELS.
  it("propose « Sans etablissement » sur le journal d'activite, et l'envoie au serveur", async () => {
    const fetchMock = buildFetchMock([
      routeEtablissements([chu]),
      routeAccessLog((url) => {
        if (url.searchParams.get('source') !== 'activite') {
          return [ligneAcces()]
        }
        const ligneAmorcage = {
          id: 'log-amorcage',
          source: 'activite' as const,
          establishmentId: null,
          serviceId: null,
          userID: 'cli:bootstrap-super-admin',
          userFirstName: null,
          userLastName: null,
          action: 'superAdmin.granted',
          createdAt: '2026-01-15T10:30:00.000Z',
          entityType: 'user',
          entityID: 'u9',
          patientId: null,
          accesParOctroi: null,
        }
        const ligneOrdinaire = {
          ...ligneAmorcage,
          id: 'log-ordinaire',
          establishmentId: 'e1',
          userID: 'u1',
          action: 'patient.created',
        }
        return url.searchParams.get('establishmentId') === 'aucun'
          ? [ligneAmorcage]
          : [ligneAmorcage, ligneOrdinaire]
      }),
    ])
    vi.stubGlobal('fetch', fetchMock)

    monter(superAdmin)

    await userEvent.click(await screen.findByLabelText('Journal'))
    await userEvent.click(
      await screen.findByRole('option', { name: "Journal d'activité" }),
    )

    await waitFor(() => {
      expect(screen.getByText('Patient créé')).toBeInTheDocument()
    })
    // Le libellé de l'action d'amorçage existe désormais (Important n°2) : la ligne ne s'affiche
    // plus sous son nom technique.
    expect(screen.getByText('Super-admin accordé (script)')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Établissement'))
    await userEvent.click(
      await screen.findByRole('option', {
        name: 'Sans établissement (amorçage)',
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByText('Super-admin accordé (script)'),
      ).toBeInTheDocument()
      expect(screen.queryByText('Patient créé')).not.toBeInTheDocument()
    })
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('establishmentId=aucun'),
      ),
    ).toBe(true)
  })

  // `PatientAccessLog.establishmentId` est NON NULLABLE : la demander « sans etablissement » n'a
  // pas de sens, et le back repond 400. L'option n'existe donc pas sur ce journal-la, plutot que
  // d'exister et d'echouer.
  it('ne propose PAS « Sans etablissement » sur le journal des consultations', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeEtablissements([chu]),
        routeAccessLog([ligneAcces()]),
      ]),
    )

    monter(superAdmin)

    await userEvent.click(await screen.findByLabelText('Établissement'))
    expect(
      await screen.findByRole('option', { name: 'CHU Bordeaux' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'Sans établissement (amorçage)' }),
    ).not.toBeInTheDocument()
  })

  // Le vocabulaire d'action de l'ecran plateforme couvre les DIX-NEUF valeurs que le journal
  // d'activite peut porter, pas les huit de l'ecran de service (Important n°2). Le contrat qui
  // le tient vit cote back (`unit/utils/access-log-vocabulaire.test.ts`, qui lit ce dictionnaire
  // et `AppEvents`) ; ce cas-ci verifie que l'ecran s'en sert reellement, sur la valeur qui
  // comptait le plus : la reemission de lien par le super-admin, la route la plus puissante du
  // systeme, et la ligne que la tache 7 existe pour creer.
  it("propose user.accessLinkReissued dans le filtre Action du journal d'activite", async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([routeEtablissements([chu]), routeAccessLog([])]),
    )

    monter(superAdmin)

    await userEvent.click(await screen.findByLabelText('Journal'))
    await userEvent.click(
      await screen.findByRole('option', { name: "Journal d'activité" }),
    )

    await userEvent.click(screen.getByLabelText('Action'))
    expect(
      await screen.findByRole('option', {
        name: "Lien d'accès réémis (super-admin)",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Super-admin accordé (script)' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Membre rattaché' }),
    ).toBeInTheDocument()
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
    await userEvent.click(
      await screen.findByRole('option', { name: "Journal d'activité" }),
    )

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

// ------------------------------------------------------------------------------------------
// PAGINATION (2026-10-01) : ferme la limite §8 de docs/multi-tenant/decisions-etape-4b.md.
// ------------------------------------------------------------------------------------------
//
// L'ecran affichait une lecture tronquee a 200 lignes, sans pied de pagination et sans rien qui
// dise combien de lignes existaient reellement. LE POINT DE CES TESTS EST QUE LA PAGE EST
// DEMANDEE AU SERVEUR : le bouchon honore `page`/`pageSize`, donc un decoupage fait dans le
// navigateur — sur une page deja recue — ne les satisferait pas.
describe("pagination de l'ecran plateforme", () => {
  // 120 lignes au total, une seule rendue par page, reconnaissable a son nom : c'est ce qui permet
  // d'affirmer QUELLE page est affichee, et pas seulement qu'il y en a une.
  const routePaginee = (total = 120) =>
    routeAccessLog(
      (url) => [
        ligneAcces({
          id: `log-p${url.searchParams.get('page') ?? '1'}`,
          userFirstName: 'Page',
          userLastName: String(url.searchParams.get('page') ?? '1'),
        }),
      ],
      total,
    )

  const requetesJournal = (mock: {
    mock: { calls: [unknown, ...unknown[]][] }
  }) =>
    mock.mock.calls
      .map(([u]) => new URL(String(u), 'http://localhost'))
      .filter((u) => u.pathname.endsWith('/super-admin/access-log'))

  it('demande la premiere page et affiche le total du serveur, pas la taille de la page recue', async () => {
    const fetchMock = buildFetchMock([
      routeEtablissements([chu]),
      routePaginee(),
    ])
    vi.stubGlobal('fetch', fetchMock)

    monter(superAdmin)

    // Le total vient du serveur (120), jamais du nombre de lignes recues (1) : c'est exactement ce
    // que la borne dure de 200 ne pouvait pas dire.
    expect(
      await screen.findByText('120 résultats', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    const derniere = requetesJournal(fetchMock).at(-1)?.searchParams
    expect(derniere?.get('page')).toBe('1')
    expect(derniere?.get('pageSize')).toBe('25')
    // 120 lignes par pages de 25 : la 5e page est la derniere proposee, jamais une 6e.
    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '6' })).not.toBeInTheDocument()
  })

  it('demande au SERVEUR la page choisie', async () => {
    const fetchMock = buildFetchMock([
      routeEtablissements([chu]),
      routePaginee(),
    ])
    vi.stubGlobal('fetch', fetchMock)

    monter(superAdmin)
    await screen.findByText('120 résultats', {}, { timeout: 3000 })

    await userEvent.click(screen.getByRole('button', { name: '3' }))

    await waitFor(() => {
      expect(requetesJournal(fetchMock).at(-1)?.searchParams.get('page')).toBe(
        '3',
      )
    })
  })

  // CHANGER DE FILTRE RAMENE A LA PREMIERE PAGE, ET LA MEME REQUETE PORTE LES DEUX. La page 7 d'un
  // perimetre plus etroit n'existe peut-etre pas : une requete intermediaire pour cette page-la
  // rendrait un tableau vide indiscernable d'un « aucune entree ».
  it('changer de filtre revient a la premiere page, dans la meme requete', async () => {
    const fetchMock = buildFetchMock([
      routeEtablissements([chu]),
      routePaginee(),
    ])
    vi.stubGlobal('fetch', fetchMock)

    monter(superAdmin)
    await screen.findByText('120 résultats', {}, { timeout: 3000 })
    await userEvent.click(screen.getByRole('button', { name: '3' }))
    await waitFor(() => {
      expect(requetesJournal(fetchMock).at(-1)?.searchParams.get('page')).toBe(
        '3',
      )
    })

    await userEvent.click(screen.getByLabelText('Action'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Dossier ouvert' }),
    )

    await waitFor(() => {
      expect(
        requetesJournal(fetchMock).at(-1)?.searchParams.get('action'),
      ).toBe('dossier.ouvert')
    })
    expect(requetesJournal(fetchMock).at(-1)?.searchParams.get('page')).toBe(
      '1',
    )
    // AUCUNE requete ne demande la page 3 AVEC le filtre : les deux mises a jour partent ensemble.
    expect(
      requetesJournal(fetchMock).filter(
        (u) =>
          u.searchParams.get('action') === 'dossier.ouvert' &&
          u.searchParams.get('page') !== '1',
      ),
    ).toEqual([])
  })

  // Changer de journal revient aussi au debut : les deux journaux n'ont ni le meme volume ni les
  // memes lignes, et rester en page 3 demanderait une page qui n'existe probablement pas dans
  // l'autre.
  it('changer de journal revient a la premiere page', async () => {
    const fetchMock = buildFetchMock([
      routeEtablissements([chu]),
      routePaginee(),
    ])
    vi.stubGlobal('fetch', fetchMock)

    monter(superAdmin)
    await screen.findByText('120 résultats', {}, { timeout: 3000 })
    await userEvent.click(screen.getByRole('button', { name: '3' }))
    await waitFor(() => {
      expect(requetesJournal(fetchMock).at(-1)?.searchParams.get('page')).toBe(
        '3',
      )
    })

    await userEvent.click(screen.getByLabelText('Journal'))
    await userEvent.click(
      await screen.findByRole('option', { name: "Journal d'activité" }),
    )

    await waitFor(() => {
      expect(
        requetesJournal(fetchMock).at(-1)?.searchParams.get('source'),
      ).toBe('activite')
    })
    expect(requetesJournal(fetchMock).at(-1)?.searchParams.get('page')).toBe(
      '1',
    )
  })
})
