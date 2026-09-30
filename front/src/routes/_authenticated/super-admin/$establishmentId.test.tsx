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
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuthState, User } from '@/types/auth.ts'
import { Route as detailRoute } from './$establishmentId.tsx'

// ---------------------------------------------------------------------------
// « il n'existe aucun fichier de test pour cette
// route ». Le code de `$establishmentId.tsx` distingue bien trois états
// (chargement/erreur/vide-ou-prêt via `libs/queryState.ts`), mais rien ne
// garde cette distinction dans le temps — un `isPending || !establishment`
// réintroduit un jour donnerait de nouveau un « Chargement… » perpétuel
// devant une vraie erreur (identifiant supprimé ou mal recopié), sans
// qu'aucun test ne le remarque. Ce fichier verrouille les trois états, en
// montant les VRAIES options du fichier de route (même convention que
// `remontage.test.tsx` et `super-admin-journey.test.tsx`) : un correctif
// retiré là-bas redevient rouge ici.
// ---------------------------------------------------------------------------

dayjs.extend(utc)

const superAdmin: User = {
  id: 'sa1',
  email: 'super@medisync.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: true,
  establishments: [],
}

const optionsDe = (route: AnyRoute) => route.options

const rootRoute = createRootRouteWithContext<{ authState: AuthState }>()({
  component: () => <Outlet />,
})

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '/_authenticated',
  component: () => <Outlet />,
})

// Les VRAIES options du fichier : un correctif retiré de `$establishmentId.tsx`
// redevient rouge ici, pas seulement dans une réimplémentation locale.
const detailRouteDeTest = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'super-admin/$establishmentId',
  component: optionsDe(detailRoute).component,
})

const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([detailRouteDeTest]),
])

const monter = (fetchImpl: (url: string) => Promise<Response> | never) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => fetchImpl(input.toString())),
  )
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/super-admin/e1'] }),
    context: { authState: { isAuthenticated: true, user: superAdmin } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const etablissementComplet = {
  id: 'e1',
  name: 'CHU',
  createdAt: '2025-01-01T00:00:00.000Z',
  deactivatedAt: null,
  serviceCount: 0,
  accountCount: 0,
  patientCount: 0,
  firstAdmin: null,
  lastActivityAt: null,
  services: [],
  members: [],
  // `activityLog` N'EST PLUS DANS CETTE REPONSE depuis le 2026-10-01 : le journal a sa propre
  // route paginée (`GET /super-admin/establishments/:id/activity-log`) — voir le describe dédié
  // plus bas.
}

const pageDeJournal = (url: string) => {
  const params = new URL(url, 'http://localhost').searchParams
  const page = Number(params.get('page') ?? 1)
  // Une ligne par page, reconnaissable à son `entityID` : c'est ce qui permet d'affirmer QUELLE
  // page est affichée, et pas seulement qu'il y en a une. 120 au total, comme le journal
  // d'administration (`admin/activity-log.test.tsx`).
  return {
    data: [
      {
        id: `l${page}`,
        userID: 'u9',
        userFirstName: 'Camille',
        userLastName: `Page${page}`,
        action: 'patient.created',
        entityType: 'patient',
        entityID: `p${page}`,
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ],
    total: 120,
    page,
    pageSize: Number(params.get('pageSize') ?? 50),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('etats de l ecran de detail d etablissement', () => {
  it('affiche un etat de chargement tant que la reponse n est pas arrivee', async () => {
    // Une promesse qui ne se règle jamais : la requête reste `isPending`
    // indéfiniment, exactement l'état que ce cas vérifie.
    monter(
      () =>
        new Promise<Response>(() => {
          // Ne se règle jamais : la requête reste `isPending` indéfiniment.
        }),
    )

    expect(await screen.findByText(/chargement/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/impossible de charger cet établissement/i),
    ).not.toBeInTheDocument()
  })

  // LE CAS QUI COMPTE LE PLUS : c'est lui qui
  // donnait un « Chargement… » perpétuel sur un identifiant supprimé ou mal
  // recopié — le geste même que cet écran sert.
  it("affiche une erreur distincte, jamais un chargement perpetuel, quand l'etablissement ne peut pas etre charge", async () => {
    monter(() => Promise.resolve(new Response(null, { status: 404 })))

    await waitFor(() => {
      expect(
        screen.getByText(/impossible de charger cet établissement/i),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText(/^chargement/i)).not.toBeInTheDocument()

    // Le bouton de retour reste offert : une erreur ne doit jamais être une
    // impasse.
    expect(
      screen.getByRole('button', { name: /retour à la liste/i }),
    ).toBeInTheDocument()
  })

  // L'état "vide" : un succès HTTP sans le corps attendu (`null`), que
  // `queryState` traite comme `hasData: false` — le même filet de sécurité
  // que l'erreur (`!establishment`) l'attrape aussi, et affiche le même
  // message plutôt que de laisser passer un rendu qui déréférencerait un
  // établissement absent.
  it("affiche le meme etat d'erreur qu'une panne quand la reponse est un succes sans donnee", async () => {
    monter(() => Promise.resolve(new Response('null', { status: 200 })))

    await waitFor(() => {
      expect(
        screen.getByText(/impossible de charger cet établissement/i),
      ).toBeInTheDocument()
    })
  })

  it("affiche le contenu de l'etablissement une fois la reponse arrivee", async () => {
    monter(() =>
      Promise.resolve(
        new Response(JSON.stringify(etablissementComplet), { status: 200 }),
      ),
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'CHU' })).toBeInTheDocument()
    })
    expect(
      screen.queryByText(/impossible de charger cet établissement/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/chargement/i)).not.toBeInTheDocument()
  })
})

// ------------------------------------------------------------------------------------------
// LE JOURNAL D'ACTIVITE, EXTRAIT DU DETAIL ET PAGINE (2026-10-01).
// ------------------------------------------------------------------------------------------
//
// Il arrivait DANS la reponse du detail, borne a 100 lignes : au-dela, rien ne disait qu'il y en
// avait davantage, et rien ne permettait d'y aller. Ces tests tiennent les deux choses que le
// decoupage devait obtenir — une SECONDE requete, et une page demandee au SERVEUR.
describe('journal d activite du detail d etablissement', () => {
  const monterAvecJournal = () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/activity-log')) {
        return Promise.resolve(Response.json(pageDeJournal(url)))
      }
      return Promise.resolve(Response.json(etablissementComplet))
    })
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/super-admin/e1'] }),
      context: { authState: { isAuthenticated: true, user: superAdmin } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    const requetesJournal = () =>
      fetchMock.mock.calls
        .map(([u]) => new URL(String(u), 'http://localhost'))
        .filter((u) => u.pathname.endsWith('/activity-log'))
    return { fetchMock, requetesJournal }
  }

  // Le corps de la table est virtualise : sous jsdom il ne rend aucune ligne (front/CLAUDE.md,
  // § Testing). Ces tests observent donc ce qui compte ici — les requetes envoyees et le pied de
  // pagination, comme `admin/activity-log.test.tsx`.
  const piedCharge = () =>
    screen.findByText('120 résultats', {}, { timeout: 3000 })

  it('demande le journal par sa PROPRE route, et affiche le total du serveur', async () => {
    const { requetesJournal } = monterAvecJournal()

    expect(await piedCharge()).toBeInTheDocument()
    // Une requete distincte de celle du detail : c'est tout l'objet du decoupage. Sans elle, le
    // journal serait de nouveau lu dans la reponse du detail, donc de nouveau borne.
    expect(requetesJournal()).not.toHaveLength(0)
    const derniere = requetesJournal().at(-1)?.searchParams
    expect(derniere?.get('page')).toBe('1')
    expect(derniere?.get('pageSize')).toBe('25')
    // 120 lignes par pages de 25 : la 5e page est la derniere, jamais une 6e.
    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '6' })).not.toBeInTheDocument()
  })

  it('demande au SERVEUR la page choisie, sans relire le detail', async () => {
    const { fetchMock, requetesJournal } = monterAvecJournal()
    await piedCharge()
    const detailsAvant = fetchMock.mock.calls.filter(
      ([u]) => !String(u).includes('/activity-log'),
    ).length

    await userEvent.click(screen.getByRole('button', { name: '3' }))

    await waitFor(() => {
      expect(requetesJournal().at(-1)?.searchParams.get('page')).toBe('3')
    })
    // CHANGER DE PAGE NE RELIT NI LES SERVICES, NI LES MEMBRES, NI LES COMPTEURS : c'est la raison
    // d'etre de la requete separee, et une requete unique pour les deux la perdrait en silence.
    expect(
      fetchMock.mock.calls.filter(
        ([u]) => !String(u).includes('/activity-log'),
      ),
    ).toHaveLength(detailsAvant)
  })
})
