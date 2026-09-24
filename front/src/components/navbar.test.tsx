import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AnyRoute } from '@tanstack/react-router'
import {
  createMemoryHistory,
  createRootRoute,
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

import { Route as serviceRoute } from '@/routes/_authenticated/e/$establishmentId/s/$serviceId.tsx'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AuthState, TenantContext, User } from '@/types/auth.ts'

import Navbar, { SettingsMenu, type SettingsMenuProps } from './navbar.tsx'

// `main.tsx` enregistre ce greffon au demarrage de l'application ; le panneau
// des taches appelle `dayjs.utc()` des son montage. Le harnais de test ne
// passe pas par `main.tsx` et doit donc le reproduire.
dayjs.extend(utc)

// Aucune permission de service accordee par defaut : chaque test ne leve que
// celles dont il a besoin, pour ne jamais dependre d'un defaut permissif.
const AUCUNE_PERMISSION: Omit<SettingsMenuProps, 'establishmentId' | 'serviceId'> = {
  canPlanning: false,
  canManageSoignants: false,
  canManageReferentials: false,
  canManageLocations: false,
  canManageMembers: false,
  canReadActivityLog: false,
}

// Meme harnais minimal que `tenantSelector.test.tsx` : `SettingsMenu` n'a
// besoin que d'un `useRouter()` fonctionnel (pour `router.navigate` au clic,
// jamais declenche par ces tests, qui ne verifient que le rendu).
const renderSettingsMenu = (props: SettingsMenuProps) => {
  const rootRoute = createRootRoute({ component: () => <SettingsMenu {...props} /> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('SettingsMenu', () => {
  // Verrou du constat reporte par la tache 12 : un administrateur sans
  // affectation de service (contexte `serviceId: null`, voir `admin.tsx`)
  // garde acces a l'ecran des membres — sa garde de route l'y autorise
  // explicitement (`members:manage`, permission d'etablissement, pas de
  // service) — et doit donc voir le lien correspondant dans ce menu.
  it('affiche le lien Membres pour un administrateur sans service en contexte', async () => {
    renderSettingsMenu({
      establishmentId: 'e1',
      serviceId: null,
      ...AUCUNE_PERMISSION,
      canManageMembers: true,
    })

    await userEvent.click(screen.getByRole('button'))

    expect(await screen.findByText('Membres')).toBeInTheDocument()
    // Aucun ecran de service n'a de destination valable sans service en
    // contexte : aucun ne doit apparaitre, meme si sa permission (de niveau
    // etablissement pour certains d'entre eux) etait accordee.
    expect(screen.queryByText('Planning')).not.toBeInTheDocument()
    expect(screen.queryByText('Activité')).not.toBeInTheDocument()
  })

  // Cas nominal : avec un service en contexte et toutes les permissions
  // accordees, Membres reste visible aux cotes des ecrans de service — le
  // verrou ci-dessus ne doit pas masquer Membres quand un service est present.
  it('affiche Membres aux cotes des ecrans de service quand un service est en contexte', async () => {
    renderSettingsMenu({
      establishmentId: 'e1',
      serviceId: 's1',
      canPlanning: true,
      canManageSoignants: true,
      canManageReferentials: true,
      canManageLocations: true,
      canManageMembers: true,
      canReadActivityLog: true,
    })

    await userEvent.click(screen.getByRole('button'))

    expect(await screen.findByText('Membres')).toBeInTheDocument()
    expect(screen.getByText('Planning')).toBeInTheDocument()
    expect(screen.getByText('Activité')).toBeInTheDocument()
  })
})

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

const arbre = rootRoute.addChildren([
  layoutDeService.addChildren([ecranDeService]),
  ecranHorsTenant,
])

const monterNavbar = (depart: string) => {
  const router = createRouter({
    routeTree: arbre,
    history: createMemoryHistory({ initialEntries: [depart] }),
    context: { authState: { isAuthenticated: true, user: utilisateur } },
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
