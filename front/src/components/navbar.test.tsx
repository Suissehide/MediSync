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
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as adminRoute } from '@/routes/_authenticated/e/$establishmentId/admin.tsx'
import { Route as serviceRoute } from '@/routes/_authenticated/e/$establishmentId/s/$serviceId.tsx'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AuthState, TenantContext, User } from '@/types/auth.ts'

import Navbar from './navbar.tsx'

// `main.tsx` enregistre ce greffon au demarrage de l'application ; le panneau
// des taches appelle `dayjs.utc()` des son montage. Le harnais de test ne
// passe pas par `main.tsx` et doit donc le reproduire.
dayjs.extend(utc)

// ---------------------------------------------------------------------------
// INVARIANT MULTI-TENANT — ce que ce bloc verrouille.
//
// `front/CLAUDE.md`, `__root.tsx`, `root.layout.tsx` et `_authenticated.tsx`
// affirment qu'aucun observateur de requete de tenant ne survit a un
// changement d'etablissement/service, parce que tout ce qui lit une API de
// tenant vit sous l'un des deux layouts — les seuls a declarer `remountDeps`,
// donc les seuls demontes au changement de couple.
//
// Le panneau des taches de cette barre lit une API de service
// (`useTodoQueries` -> `tenantApiUrl`). Tant que sa condition d'affichage
// interrogeait le STORE (`context?.serviceId`), l'affirmation etait fausse :
// `DashboardLayout` rend cette meme barre sur `/user/settings`, qui vit hors
// des deux layouts, et le contexte du store y porte encore le dernier service
// visite. L'observateur y etait donc cree sur un ecran qu'aucun changement de
// contexte ne demonte, et serait reste lie a l'ancien client de requetes.
//
// La condition porte desormais sur la ROUTE. Ces deux tests l'exigent dans
// les deux sens : absent hors des layouts de tenant, present sous le layout
// de service. Remettre `context?.serviceId` rend le premier rouge.
// ---------------------------------------------------------------------------

const utilisateur: User = {
  id: 'u1',
  email: 'a@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'ADMIN',
      soignantId: 'so1',
      services: [{ id: 's1', name: 'Cardio', role: 'COORDINATEUR' }],
    },
  ],
}

// Ce que le store porte sur un ecran hors tenant : le dernier couple visite.
// C'est precisement ce que l'ancienne condition lisait.
const dernierContexteVisite: TenantContext = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN',
  serviceRole: 'COORDINATEUR',
  soignantId: 'so1',
}

// Meme motif que `remontage.test.tsx` : on monte le VRAI layout de service,
// avec son `beforeLoad` et sa `remountDeps` lus sur le fichier de route. Le
// passage par `AnyRoute` n'est pas un contournement du typage mais la seule
// facon de lire ces options, le type d'une route de fichier portant le parent
// que le generateur lui a donne.
const optionsDe = (route: AnyRoute) => route.options

// La barre n'est montee ici que pour etre observee : replier la barre
// laterale n'a aucun effet dans ces tests.
const replierLaBarre = () => undefined

const rootRoute = createRootRouteWithContext<{ authState: AuthState }>()({
  component: () => <Outlet />,
})

const layoutDeService = createRoute({
  getParentRoute: () => rootRoute,
  path: 'e/$establishmentId/s/$serviceId',
  beforeLoad: optionsDe(serviceRoute).beforeLoad,
  remountDeps: optionsDe(serviceRoute).remountDeps,
  component: () => <Outlet />,
})

const ecranDeService = createRoute({
  getParentRoute: () => layoutDeService,
  path: 'dashboard',
  component: () => <Navbar toggleSidebar={replierLaBarre} />,
})

// L'ecran hors tenant : `/user/settings` rend bien `DashboardLayout`, donc
// cette meme barre, sans vivre sous aucun des deux layouts de tenant.
const ecranHorsTenant = createRoute({
  getParentRoute: () => rootRoute,
  path: 'user/settings',
  component: () => <Navbar toggleSidebar={replierLaBarre} />,
})

// Le vrai layout d'administration, pour les onglets de l'echelle etablissement.
const layoutAdmin = createRoute({
  getParentRoute: () => rootRoute,
  path: 'e/$establishmentId/admin',
  beforeLoad: optionsDe(adminRoute).beforeLoad,
  remountDeps: optionsDe(adminRoute).remountDeps,
  component: () => <Outlet />,
})

const ecranAdmin = createRoute({
  getParentRoute: () => layoutAdmin,
  path: 'members',
  component: () => <Navbar toggleSidebar={replierLaBarre} />,
})

// La plateforme : son layout reel exige le drapeau ; seul le chemin compte pour la barre.
const ecranPlateforme = createRoute({
  getParentRoute: () => rootRoute,
  path: 'super-admin/users',
  component: () => <Navbar toggleSidebar={replierLaBarre} />,
})

const arbre = rootRoute.addChildren([
  layoutDeService.addChildren([ecranDeService]),
  layoutAdmin.addChildren([ecranAdmin]),
  ecranPlateforme,
  ecranHorsTenant,
])

const monterNavbar = (depart: string, user: User = utilisateur) => {
  useAuthStore.setState({ user })
  const router = createRouter({
    routeTree: arbre,
    history: createMemoryHistory({ initialEntries: [depart] }),
    context: { authState: { isAuthenticated: true, user } },
  })
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const panneauDesTaches = () =>
  screen.queryByRole('button', { name: 'Liste des tâches' })

describe('panneau des taches de la barre de navigation', () => {
  beforeEach(() => {
    localStorage.clear()
    // Le cas reel : on arrive sur les reglages du compte APRES avoir visite
    // un service, donc avec ce service encore dans le store.
    useAuthStore.setState({
      isAuthenticated: true,
      user: utilisateur,
      context: dernierContexteVisite,
    })
    // Le panneau, s'il est rendu, emet une vraie requete : on la neutralise
    // plutot que de laisser `fetch` echouer au hasard de l'environnement.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.setState({ isAuthenticated: false, user: null, context: null })
  })

  it("n'est pas rendu sur un ecran hors des layouts de tenant", async () => {
    monterNavbar('/user/settings')

    // On attend que la barre soit montee avant de conclure a l'absence :
    // sans cette attente, l'assertion passerait sur un arbre encore vide.
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        'MediSync',
      )
    })
    expect(panneauDesTaches()).not.toBeInTheDocument()
  })

  it('est rendu sous le layout de service', async () => {
    monterNavbar('/e/e1/s/s1/dashboard')

    await waitFor(() => {
      expect(panneauDesTaches()).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Navigation par echelle (2026-09-28) : la barre n'affiche que les onglets de l'echelle de la
// ROUTE, filtres par le role. Ces cas remplacent ceux de l'ancien `SettingsMenu`.
// ---------------------------------------------------------------------------

const avecRoles = (
  establishmentRole: 'ADMIN' | 'MEMBER',
  serviceRole: 'COORDINATEUR' | 'INTERVENANT' | null,
  isSuperAdmin = false,
): User => ({
  ...utilisateur,
  isSuperAdmin,
  establishments: [
    {
      ...utilisateur.establishments[0],
      role: establishmentRole,
      services: serviceRole ? [{ id: 's1', name: 'Cardio', role: serviceRole }] : [],
    },
  ],
})

const onglets = () =>
  within(screen.getByRole('navigation', { name: 'Navigation' }))
    .getAllByRole('link')
    .map((lien) => lien.textContent)

describe('onglets de la barre de navigation', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ isAuthenticated: true, context: null })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.setState({ isAuthenticated: false, user: null, context: null })
  })

  // Le defaut n° 3 de l'inventaire, ferme : un administrateur sans aucune affectation de service
  // atteint enfin Soignants, Salles et le journal.
  it('montre les six onglets d etablissement a un administrateur sans service, et aucun onglet de service', async () => {
    monterNavbar('/e/e1/admin/members', avecRoles('ADMIN', null))

    await waitFor(() => {
      expect(onglets()).toEqual([
        'Membres',
        'Services',
        'Accès temporaires',
        'Soignants',
        'Salles',
        "Journal d'activité",
      ])
    })
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('montre au coordinateur le quotidien et l organisation, rien de l etablissement', async () => {
    monterNavbar('/e/e1/s/s1/dashboard', avecRoles('MEMBER', 'COORDINATEUR'))

    await waitFor(() => {
      expect(onglets()).toEqual([
        'Dashboard',
        'Agenda',
        'Patients',
        'Suivi',
        'Planning',
        'Thématiques',
        'Diagnostics',
      ])
    })
  })

  it('ne montre a l intervenant que les quatre onglets du quotidien', async () => {
    monterNavbar('/e/e1/s/s1/dashboard', avecRoles('MEMBER', 'INTERVENANT'))

    await waitFor(() => {
      expect(onglets()).toEqual(['Dashboard', 'Agenda', 'Patients', 'Suivi'])
    })
  })

  // Un administrateur coordinateur, sous son service : les onglets d'etablissement restent dans
  // l'administration, jamais melanges a ceux du service.
  it('ne melange jamais deux echelles', async () => {
    monterNavbar('/e/e1/s/s1/dashboard', avecRoles('ADMIN', 'COORDINATEUR'))

    await waitFor(() => {
      expect(onglets()).toContain('Planning')
    })
    expect(onglets()).not.toContain('Soignants')
    expect(onglets()).not.toContain('Membres')
  })

  it('montre les trois onglets de la plateforme a un super-admin', async () => {
    monterNavbar('/super-admin/users', avecRoles('MEMBER', null, true))

    await waitFor(() => {
      expect(onglets()).toEqual(['Établissements', 'Comptes', 'Journaux'])
    })
  })

  // L'invariant, cote onglets : sur un ecran hors tenant, le store porte encore le dernier
  // service visite, et la barre ne doit pas s'en servir pour afficher des onglets.
  it('n affiche aucun onglet hors des trois echelles, meme avec un service dans le store', async () => {
    useAuthStore.setState({ context: dernierContexteVisite })
    monterNavbar('/user/settings')

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('MediSync')
    })
    expect(screen.queryByRole('navigation', { name: 'Navigation' })).not.toBeInTheDocument()
  })
})
