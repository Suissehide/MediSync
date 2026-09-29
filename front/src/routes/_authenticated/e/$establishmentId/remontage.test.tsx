import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { AnyRoute } from '@tanstack/react-router'
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  establishmentApiUrl,
  tenantApiUrl,
} from '@/constants/config.constant.ts'
import {
  createTenantQueryClient,
  useTenantQueryClient,
} from '@/hooks/useTenantSwitch.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AuthState, User } from '@/types/auth.ts'
import { Route as adminRoute } from './admin.tsx'
import { Route as serviceRoute } from './s/$serviceId.tsx'

// CE QUE CE FICHIER VERROUILLE — la promesse d'ensemble du cloisonnement,
// pas une de ses pieces.
//
// Le mecanisme de l'etape 2 tient en deux moities : `useTenantQueryClient`
// construit un `QueryClient` neuf par couple etablissement/service, et les
// deux layouts de tenant DEMONTENT leur sous-arbre quand le couple change.
// La seconde moitie n'est pas automatique : le routeur ne rend le composant
// d'une route avec une cle React que si une dependance de remontage en
// produit une, et React Query lie l'observateur au client a la construction
// sans jamais le relier. Sans demontage, un ecran garde donc l'observateur
// de l'ANCIEN client et continue d'afficher le cache du service precedent
// sous l'URL du nouveau — d'autant plus que les cles de requete ne portent
// pas le tenant (D2), donc rien ne force un rechargement.
//
// Les seize tests de `useTenantSwitch.test.ts` verifient les pieces (un
// client neuf est construit, l'ancien est vide, les stores sont remis a
// zero) ; aucun ne monte un ecran sous un routeur. Ceux-ci le font : ils
// exigent un DEMONTAGE puis un REMONTAGE, et que l'ecran interroge le
// nouveau tenant. Retirer `remountDeps` de l'un des deux layouts les rend
// rouges — c'est leur raison d'etre. Un test qui se contenterait de
// constater la presence de l'option verrouillerait le remede, pas le
// symptome.

const user: User = {
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
      services: [
        { id: 's1', name: 'Cardio', role: 'COORDINATEUR' },
        { id: 's2', name: 'Neuro', role: 'INTERVENANT' },
      ],
    },
    {
      id: 'e2',
      name: 'Clinique',
      role: 'ADMIN',
      services: [],
    },
  ],
}

// Journal des montages/demontages et des URL effectivement interrogees. Une
// `queryFn` qui lit l'URL A L'APPEL, exactement comme les modules `api/*.ts`
// du depot, qui appellent `tenantApiUrl()` au moment de la requete.
let journal: string[] = []
let requetes: string[] = []

const useEcran = (nom: string, urlDuTenant: () => string) => {
  useEffect(() => {
    journal.push(`${nom}:montage`)
    return () => {
      journal.push(`${nom}:demontage`)
    }
  }, [nom])

  return useQuery({
    // Aucun prefixe de tenant dans la cle : c'est la convention du depot
    // (D2). La cle est donc IDENTIQUE d'un service a l'autre, ce qui est
    // precisement ce qui rend le demontage indispensable.
    queryKey: ['donnees-du-tenant'],
    queryFn: () => {
      const url = urlDuTenant()
      requetes.push(url)
      return url
    },
    retry: false,
  })
}

const EcranDeService = () => {
  const { data } = useEcran('service', tenantApiUrl)
  return <div data-testid="affichage">{data ?? 'chargement'}</div>
}

const EcranDAdministration = () => {
  const { data } = useEcran('admin', establishmentApiUrl)
  return <div data-testid="affichage">{data ?? 'chargement'}</div>
}

const rootRoute = createRootRouteWithContext<{
  queryClient: ReturnType<typeof createTenantQueryClient>
  authState: AuthState
}>()({
  component: () => <Outlet />,
})

// Reproduit `_authenticated.tsx` : un `beforeLoad` ASYNCHRONE qui renvoie
// l'authState. La frontiere d'attente compte — c'est elle qui separe la
// garde parente des gardes de tenant.
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '/_authenticated',
  beforeLoad: async ({ context }) => {
    await Promise.resolve()
    return { authState: context.authState }
  },
  component: () => <Outlet />,
})

// Les deux layouts de tenant sont montes avec les VRAIES options des
// fichiers de route : leur `beforeLoad` et leur `remountDeps`. Retirer
// l'option du fichier de route la retire donc d'ici, et ces tests tombent.
//
// Le passage par `AnyRoute` n'est pas un contournement du typage mais la
// seule facon de lire ces options : le type d'une route de FICHIER porte le
// parent que le generateur lui a donne (`routeTree.gen.ts`), qu'un arbre de
// test ne peut pas reproduire — `routeTree.gen.ts` lui-meme n'y arrive pas
// sans `as any`. Les fonctions recuperees, elles, sont bien les vraies.
const optionsDe = (route: AnyRoute) => route.options

const serviceLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'e/$establishmentId/s/$serviceId',
  beforeLoad: optionsDe(serviceRoute).beforeLoad,
  remountDeps: optionsDe(serviceRoute).remountDeps,
  component: () => <Outlet />,
})

const serviceScreenRoute = createRoute({
  getParentRoute: () => serviceLayoutRoute,
  path: 'dashboard',
  component: EcranDeService,
})

const adminLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'e/$establishmentId/admin',
  beforeLoad: optionsDe(adminRoute).beforeLoad,
  remountDeps: optionsDe(adminRoute).remountDeps,
  component: () => <Outlet />,
})

const adminScreenRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: 'members',
  component: EcranDAdministration,
})

const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    serviceLayoutRoute.addChildren([serviceScreenRoute]),
    adminLayoutRoute.addChildren([adminScreenRoute]),
  ]),
])

// Reproduit `App`/`AppRoutes` de `main.tsx` : le client courant est tenu par
// `useTenantQueryClient` et pousse a la fois dans le fournisseur React Query
// et dans le contexte du routeur.
const Application = ({
  router,
  initialClient,
}: {
  router: ReturnType<typeof creerRouteur>
  initialClient: ReturnType<typeof createTenantQueryClient>
}) => {
  const queryClient = useTenantQueryClient(initialClient)
  const utilisateur = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider
        router={router}
        context={{
          queryClient,
          authState: { user: utilisateur, isAuthenticated },
        }}
      />
    </QueryClientProvider>
  )
}

const creerRouteur = (
  depart: string,
  initialClient: ReturnType<typeof createTenantQueryClient>,
) =>
  createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [depart] }),
    context: {
      queryClient: initialClient,
      authState: { user: null, isAuthenticated: false },
    },
  })

// `findBy*` ne garantit que la presence du noeud, pas son contenu : l'ecran
// s'affiche d'abord vide (« chargement ») le temps que la requete se regle.
// On attend donc toujours le CONTENU, sans quoi l'assertion suivante mesure
// un ordonnancement plutot qu'un cloisonnement.
const attendreAffichage = async (fragmentDUrl: string) => {
  await waitFor(() => {
    expect(screen.getByTestId('affichage')).toHaveTextContent(fragmentDUrl)
  })
}

const monter = (depart: string) => {
  const initialClient = createTenantQueryClient()
  const router = creerRouteur(depart, initialClient)
  render(<Application router={router} initialClient={initialClient} />)
  return router
}

beforeEach(() => {
  journal = []
  requetes = []
  localStorage.clear()
  useAuthStore.setState({ isAuthenticated: true, user, context: null })
})

describe('changement de service : l ecran est demonte et interroge le nouveau service', () => {
  it('remonte l ecran et affiche la donnee du service d arrivee', async () => {
    const router = monter('/e/e1/s/s1/dashboard')

    await attendreAffichage('/e/e1/s/s1')
    expect(journal).toEqual(['service:montage'])

    await act(async () => {
      await router.navigate({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params: { establishmentId: 'e1', serviceId: 's2' },
      })
    })

    // Le coeur du test : ce qui est affiche doit venir du NOUVEAU service.
    // Sans demontage, l'observateur reste attache a l'ancien client et cette
    // attente expire sur `/e/e1/s/s1`.
    await attendreAffichage('/e/e1/s/s2')

    // Demontage PUIS remontage, et non un simple re-rendu.
    expect(journal).toEqual([
      'service:montage',
      'service:demontage',
      'service:montage',
    ])

    // Et l'ecran a bien interroge le nouveau service, au lieu de se
    // contenter d'un cache.
    expect(requetes).toEqual([
      expect.stringContaining('/e/e1/s/s1'),
      expect.stringContaining('/e/e1/s/s2'),
    ])
  })

  it('remonte encore au retour sur le service de depart', async () => {
    const router = monter('/e/e1/s/s1/dashboard')
    await attendreAffichage('/e/e1/s/s1')

    for (const serviceId of ['s2', 's1', 's2']) {
      await act(async () => {
        await router.navigate({
          to: '/e/$establishmentId/s/$serviceId/dashboard',
          params: { establishmentId: 'e1', serviceId },
        })
      })
    }

    await attendreAffichage('/e/e1/s/s2')

    // Un aller-retour ne doit pas ressusciter la donnee du premier service :
    // chaque passage construit un client neuf et refait sa requete.
    expect(requetes).toEqual([
      expect.stringContaining('/e/e1/s/s1'),
      expect.stringContaining('/e/e1/s/s2'),
      expect.stringContaining('/e/e1/s/s1'),
      expect.stringContaining('/e/e1/s/s2'),
    ])
    expect(
      journal.filter((entree) => entree === 'service:demontage'),
    ).toHaveLength(3)
  })
})

describe('changement d etablissement administre : meme exigence sur le layout d administration', () => {
  it('remonte l ecran et interroge le nouvel etablissement', async () => {
    const router = monter('/e/e1/admin/members')

    await attendreAffichage('/e/e1/admin')
    expect(journal).toEqual(['admin:montage'])

    await act(async () => {
      await router.navigate({
        to: '/e/$establishmentId/admin/members',
        params: { establishmentId: 'e2' },
      })
    })

    await attendreAffichage('/e/e2/admin')

    expect(journal).toEqual([
      'admin:montage',
      'admin:demontage',
      'admin:montage',
    ])
    expect(requetes).toEqual([
      expect.stringContaining('/e/e1/admin'),
      expect.stringContaining('/e/e2/admin'),
    ])
  })
})
