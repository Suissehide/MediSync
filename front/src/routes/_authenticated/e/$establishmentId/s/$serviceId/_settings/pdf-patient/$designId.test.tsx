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
import { useToastStore } from '@/store/useToastStore.ts'
import type { AuthState, User } from '@/types/auth.ts'
import type { PdfDesignContent } from '@/types/pdfDesign.ts'
import { Route as serviceLayoutRoute } from '../../../$serviceId.tsx'
import { Route as editeurRoute } from './$designId.tsx'

// La revue de branche a montre que ce fichier etait le seul sans test, et qu'il portait trois
// defauts a lui seul : l'editeur revenait a la version du serveur apres enregistrement, la
// pile d'historique partait du contenu VIDE du montage, et une rafale en attente reempilait
// l'etat annule. Les trois se voient en montant l'ecran pour de vrai.
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
  path: 'pdf-patient/$designId',
  beforeLoad: optionsDe(editeurRoute).beforeLoad,
  component: optionsDe(editeurRoute).component,
})
const listeRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'pdf-patient',
  component: () => <p>Liste</p>,
})
const dashboardRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'dashboard',
  component: () => <p>Tableau de bord</p>,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    serviceRoute.addChildren([ecranRoute, listeRoute, dashboardRoute]),
  ]),
])

const contenu = (x: number): PdfDesignContent => ({
  version: 1,
  pages: [
    {
      kind: 'canvas',
      id: 'cover',
      background: '#ffffff',
      elements: [
        {
          id: 'titre',
          kind: 'rect',
          x,
          y: 20,
          w: 100,
          h: 30,
          rotation: 0,
          fill: '#e05a5a',
          radius: 0,
        },
      ],
    },
  ],
})

const design = (x: number) => ({
  id: 'd1',
  name: 'Mon programme',
  content: contenu(x),
  isDefault: false,
})

// Le serveur garde ce qu'on lui ecrit : c'est ce qui permet de distinguer « l'ecran est revenu
// a la version du serveur » de « l'ecran a garde la mienne ».
const monter = () => {
  let enBase = design(10)
  const ecritures: PdfDesignContent[] = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    const chemin = new URL(url).pathname
    if (method === 'GET') {
      if (!chemin.endsWith('/pdf-designs')) {
        return { ok: true, status: 200, url, json: async () => [] }
      }
      return {
        ok: true,
        status: 200,
        url,
        json: async () => ({ presets: [], designs: [enBase] }),
      }
    }
    const corps = JSON.parse(String(init?.body)) as {
      content?: PdfDesignContent
    }
    if (corps.content) {
      ecritures.push(corps.content)
      enBase = { ...enBase, content: corps.content }
    }
    return { ok: true, status: 200, url, json: async () => enBase }
  })
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/e/e1/s/s1/pdf-patient/d1'],
    }),
    context: { authState: { isAuthenticated: true, user } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ecritures }
}

const champX = () => screen.getByLabelText('X') as HTMLInputElement

const selectionnerTitre = async () => {
  const bouton = await screen.findByTestId('poignee-deplacement-titre')
  await userEvent.click(bouton)
  return champX()
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

describe('editeur de design', () => {
  it('ouvre sur le contenu du design', async () => {
    monter()
    const x = await selectionnerTitre()
    expect(x.value).toBe('10')
  })

  // I3 : la pile d'historique partait du contenu VIDE du montage, donc 400 ms apres
  // l'ouverture « Annuler » etait actif et vidait la toile — « Enregistrer » repondait alors
  // 400, et quitter declenchait la boite beforeunload.
  it('n a rien a annuler tant qu on n a rien fait', async () => {
    monter()
    await selectionnerTitre()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
    })
  })

  it('ne vide pas la toile quand on annule juste apres l ouverture', async () => {
    monter()
    await selectionnerTitre()
    await new Promise((r) => setTimeout(r, 600))

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.getByTestId('poignee-deplacement-titre')).toBeInTheDocument()
  })

  // I1 : `marquerEnregistre` se declarait a jour alors que le cache n'etait pas encore
  // rafraichi, donc l'ecran se resynchronisait sur l'ANCIEN contenu juste apres la sauvegarde.
  it('garde la version enregistree apres un enregistrement', async () => {
    const { ecritures } = monter()
    const x = await selectionnerTitre()

    await userEvent.clear(x)
    await userEvent.type(x, '250')
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    await waitFor(() => {
      expect(ecritures.length).toBeGreaterThan(0)
    })
    const page = ecritures.at(-1)?.pages[0]
    if (page?.kind !== 'canvas') {
      throw new Error('forme inattendue')
    }
    expect(page.elements[0]?.x).toBe(250)

    // Et l'ecran ne retombe pas sur la version d'avant. La selection est perdue au
    // rafraichissement du cache — c'est admis, on la reprend pour lire la valeur.
    await new Promise((r) => setTimeout(r, 300))
    const apres = await selectionnerTitre()
    expect(apres.value).toBe('250')
  })

  it('redescend a « rien a enregistrer » une fois enregistre', async () => {
    monter()
    const x = await selectionnerTitre()

    await userEvent.clear(x)
    await userEvent.type(x, '250')
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    await waitFor(() => {
      expect(
        screen.queryByText('Modifications non enregistrées'),
      ).not.toBeInTheDocument()
    })
  })

  // I2 : annuler pendant une rafale en attente laissait le minuteur deposer apres coup
  // l'etat annule, et le cran suivant ne bougeait plus.
  it('annule deux fois de suite, meme juste apres une modification', async () => {
    monter()
    const x = await selectionnerTitre()

    await userEvent.clear(x)
    await userEvent.type(x, '250')
    // Chaque rafale doit etre DEPOSEE avant la suivante, sinon on annule un cran qui n'a
    // jamais ete empile et le test mesure sa propre impatience.
    await new Promise((r) => setTimeout(r, 600))
    await userEvent.clear(x)
    await userEvent.type(x, '300')
    await new Promise((r) => setTimeout(r, 600))

    const annuler = screen.getByRole('button', { name: 'Annuler' })
    await waitFor(() => {
      expect(annuler).toBeEnabled()
    })
    await userEvent.click(annuler)
    const apresUn = champX().value
    await userEvent.click(annuler)

    await waitFor(() => {
      expect(champX().value).not.toBe(apresUn)
    })
  })
})
