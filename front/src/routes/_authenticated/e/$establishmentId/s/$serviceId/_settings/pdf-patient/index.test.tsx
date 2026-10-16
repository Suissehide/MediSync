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
import type { PdfDesignSummary } from '@/types/pdfDesignList.ts'
import { Route as serviceLayoutRoute } from '../../../$serviceId.tsx'
import { Route as pdfPatientRoute } from './index.tsx'

// La barre de navigation lit `dayjs.utc` ; `main.tsx`, qui enregistre le greffon, n'est pas charge ici.
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
  path: 'pdf-patient',
  beforeLoad: optionsDe(pdfPatientRoute).beforeLoad,
  component: optionsDe(pdfPatientRoute).component,
})
const editeurRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'pdf-patient/$designId',
  component: () => <p>Editeur</p>,
})
const dashboardRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'dashboard',
  component: () => <p>Tableau de bord</p>,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    serviceRoute.addChildren([ecranRoute, editeurRoute, dashboardRoute]),
  ]),
])

const CONTENU = {
  version: 1 as const,
  pages: [
    {
      kind: 'canvas' as const,
      id: 'p1',
      background: '#ffffff',
      elements: [],
    },
  ],
}

const design = (
  id: string,
  name: string,
  isDefault = false,
): PdfDesignSummary => ({ id, name, content: CONTENU, isDefault })

type Liste = { presets: PdfDesignSummary[]; designs: PdfDesignSummary[] }

const monter = (liste: Liste) => {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    const chemin = new URL(url).pathname
    if (method === 'GET') {
      if (!chemin.endsWith('/pdf-designs')) {
        // Le reste de l'ecran (barre de navigation, panneau des taches) lit des listes.
        return { ok: true, status: 200, url, json: async () => [] }
      }
      const archived = new URL(url).searchParams.get('archived') === 'true'
      return {
        ok: true,
        status: 200,
        url,
        json: async () => (archived ? { presets: [], designs: [] } : liste),
      }
    }
    // Toute ecriture repond le design cree/modifie : l'ecran n'en lit que le nom.
    return {
      ok: true,
      status: method === 'POST' ? 201 : 200,
      url,
      json: async () => design('dn', 'Nouveau'),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/e/e1/s/s1/pdf-patient'],
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

// Les actions secondaires d'une carte vivent dans son menu « … » : une seule action
// principale par carte, le reste a un clic de plus.
const ouvrirMenu = async (nom: string) =>
  userEvent.click(
    await screen.findByRole('button', { name: `Actions sur ${nom}` }),
  )

const carteDe = async (nom: string) => {
  const titre = await screen.findByText(nom)
  const carte = titre.closest('article')
  if (!carte) {
    throw new Error(`Carte ${nom} introuvable`)
  }
  return within(carte)
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

describe('ecran des designs de PDF patient', () => {
  it('montre les modeles livres et les designs du service dans deux groupes', async () => {
    monter({
      presets: [design('p1', 'Programme SMCV')],
      designs: [design('d1', 'Mon programme')],
    })

    expect(await screen.findByText('Programme SMCV')).toBeInTheDocument()
    expect(screen.getByText('Mon programme')).toBeInTheDocument()
    expect(screen.getByText('Modèles livrés')).toBeInTheDocument()
    expect(screen.getByText('Les designs du service')).toBeInTheDocument()
  })

  it('un modele livre se duplique mais ne se modifie ni ne se supprime', async () => {
    monter({ presets: [design('p1', 'Programme SMCV')], designs: [] })
    const carte = await carteDe('Programme SMCV')

    expect(carte.getByRole('button', { name: /Dupliquer/ })).toBeInTheDocument()
    expect(
      carte.queryByRole('button', { name: /Modifier/ }),
    ).not.toBeInTheDocument()
    // Pas de menu non plus : un modele livre n'a rien a renommer, poser par defaut ni
    // supprimer depuis un service.
    expect(
      carte.queryByRole('button', { name: /Actions sur/ }),
    ).not.toBeInTheDocument()
  })

  // Etape 3 : la carte montrait « 1 page » ; elle montre maintenant ce que le design donne.
  it('montre une vignette de la premiere page sur chaque carte', async () => {
    monter({ presets: [design('p1', 'Programme SMCV')], designs: [] })
    const carte = await carteDe('Programme SMCV')
    expect(carte.getByTestId('vignette-p1')).toBeInTheDocument()
  })

  it('invite a dupliquer un modele quand le service n a encore aucun design', async () => {
    monter({ presets: [design('p1', 'Programme SMCV')], designs: [] })

    expect(
      await screen.findByText(/Dupliquez un modèle pour le personnaliser/),
    ).toBeInTheDocument()
  })

  // Un seul badge « Par défaut » sur l'ecran : l'action, elle, s'appelle « Définir par défaut »,
  // sans quoi l'etat et le geste porteraient le meme mot sur deux cartes voisines.
  it('marque le design par defaut, et lui seul', async () => {
    monter({
      presets: [],
      designs: [design('d1', 'Celui-ci', true), design('d2', 'Pas celui-la')],
    })

    expect(await screen.findByText('Par défaut')).toBeInTheDocument()
    expect(screen.getAllByText('Par défaut')).toHaveLength(1)
  })

  it('envoie la duplication du bon modele', async () => {
    const fetchMock = monter({
      presets: [design('p1', 'Programme SMCV'), design('p2', 'Autre modèle')],
      designs: [],
    })
    const carte = await carteDe('Autre modèle')

    await userEvent.click(carte.getByRole('button', { name: /Dupliquer/ }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'POST',
      )
      expect(post).toBeDefined()
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        sourcePresetId: 'p2',
      })
    })
  })

  // On duplique aussi un design DEJA FAIT du service, pas seulement un modele livre : c'est
  // la seule facon de partir d'un design maison pour en faire une variante.
  it('duplique un design du service depuis son menu', async () => {
    const fetchMock = monter({
      presets: [],
      designs: [design('d1', 'Mon programme')],
    })
    await screen.findByText('Mon programme')

    await ouvrirMenu('Mon programme')
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Dupliquer' }),
    )

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'POST',
      )
      expect(post).toBeDefined()
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        sourceDesignId: 'd1',
      })
    })
  })

  it('un design du service mene a son editeur', async () => {
    monter({ presets: [], designs: [design('d1', 'Mon programme')] })
    const carte = await carteDe('Mon programme')

    await userEvent.click(carte.getByRole('button', { name: /Modifier/ }))

    expect(await screen.findByText('Editeur')).toBeInTheDocument()
  })

  it('pose le design par defaut par un PATCH', async () => {
    const fetchMock = monter({
      presets: [],
      designs: [design('d1', 'Mon programme')],
    })
    await screen.findByText('Mon programme')

    await ouvrirMenu('Mon programme')
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Définir par défaut' }),
    )

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'PATCH',
      )
      expect(patch).toBeDefined()
      expect(String(patch?.[0])).toMatch(/\/pdf-designs\/d1$/)
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ isDefault: true })
    })
  })

  // L'onglet « Supprimes » lit la MEME route avec `?archived=true` : sans le parametre, l'ecran
  // montrerait les designs actifs sous un titre qui promet le contraire.
  it('demande les supprimes au serveur quand on bascule le filtre', async () => {
    const fetchMock = monter({
      presets: [design('p1', 'Programme SMCV')],
      designs: [design('d1', 'Mon programme')],
    })
    await screen.findByText('Mon programme')

    await userEvent.click(screen.getByText('Supprimés'))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('archived=true'),
        ),
      ).toBe(true)
    })
    expect(
      await screen.findByText('Aucun design supprimé.'),
    ).toBeInTheDocument()
    // Les modeles livres n'ont rien a faire dans la corbeille.
    expect(screen.queryByText('Modèles livrés')).not.toBeInTheDocument()
  })

  it('supprime un design apres confirmation', async () => {
    const fetchMock = monter({
      presets: [],
      designs: [design('d1', 'Mon programme')],
    })
    await screen.findByText('Mon programme')

    await ouvrirMenu('Mon programme')
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Supprimer' }),
    )
    const dialogue = within(await screen.findByRole('dialog'))
    await userEvent.click(dialogue.getByRole('button', { name: /Supprimer/ }))

    await waitFor(() => {
      const suppression = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'DELETE',
      )
      expect(suppression).toBeDefined()
      expect(String(suppression?.[0])).toMatch(/\/pdf-designs\/d1$/)
    })
  })

  it('renomme un design depuis la popup', async () => {
    const fetchMock = monter({
      presets: [],
      designs: [design('d1', 'Mon programme')],
    })
    await screen.findByText('Mon programme')

    await ouvrirMenu('Mon programme')
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Renommer' }),
    )
    const dialogue = within(await screen.findByRole('dialog'))
    const champ = dialogue.getByLabelText(/Nom du design/)
    await userEvent.clear(champ)
    await userEvent.type(champ, 'Programme cardio')
    await userEvent.click(dialogue.getByRole('button', { name: /Enregistrer/ }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'PATCH',
      )
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
        name: 'Programme cardio',
      })
    })
  })

  it('cree un design vierge', async () => {
    const fetchMock = monter({ presets: [], designs: [] })

    await userEvent.click(
      await screen.findByRole('button', { name: /page blanche/i }),
    )

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'POST',
      )
      expect(post).toBeDefined()
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({})
    })
  })
})

describe('garde de l ecran des designs', () => {
  it('renvoie au tableau de bord un role sans referentials:write', async () => {
    const intervenant: User = {
      ...user,
      establishments: [
        {
          ...user.establishments[0],
          services: [{ id: 's1', name: 'Cardio', role: 'INTERVENANT' }],
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => ({
        ok: true,
        status: 200,
        url: input.toString(),
        json: async () => [],
      })),
    )
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/e/e1/s/s1/pdf-patient'],
      }),
      context: { authState: { isAuthenticated: true, user: intervenant } },
    })
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Tableau de bord')).toBeInTheDocument()
  })
})
