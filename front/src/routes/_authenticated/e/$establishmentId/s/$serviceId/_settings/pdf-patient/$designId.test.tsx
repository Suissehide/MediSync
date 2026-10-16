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

const contenu = (x: number, avecCalendrier = false): PdfDesignContent => ({
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
    ...(avecCalendrier
      ? [{ kind: 'calendar' as const, id: 'calendrier' }]
      : []),
  ],
})

// Etape 4 : un design qui porte une image DEPOSEE. Ses octets ne sont pas dans le bundle,
// il faut les demander au serveur — c'est tout le chemin que ce contenu exerce.
const contenuAvecImage = (
  source: { assetId: string } | { builtin: 'logo-chu' } = { assetId: 'a1' },
): PdfDesignContent => ({
  version: 1,
  pages: [
    {
      kind: 'canvas',
      id: 'cover',
      background: '#ffffff',
      elements: [
        {
          id: 'fond',
          kind: 'image',
          x: 0,
          y: 0,
          w: 200,
          h: 100,
          rotation: 0,
          source,
          fit: 'cover',
        },
      ],
    },
  ],
})

const design = (x: number, avecCalendrier = false) => ({
  id: 'd1',
  name: 'Mon programme',
  content: contenu(x, avecCalendrier),
  isDefault: false,
})

// Le serveur garde ce qu'on lui ecrit : c'est ce qui permet de distinguer « l'ecran est revenu
// a la version du serveur » de « l'ecran a garde la mienne ».
// `delaiGet` reproduit la fenetre de chargement : la requete repond apres un temps, et
// l'ecran est deja monte sans design.
// `avecImage` : `'asset'` pour un design dont le contenu SERVEUR porte deja l'image deposee,
// `'livree'` pour un design qui part d'une image de l'application — c'est ce second cas qui
// distingue « les octets du serveur » de « les octets de ce que l'utilisateur vient de
// choisir ».
const monter = (
  avecCalendrier = false,
  delaiGet = 0,
  avecImage: false | 'asset' | 'livree' = false,
) => {
  let enBase = avecImage
    ? {
        ...design(10),
        content: contenuAvecImage(
          avecImage === 'livree' ? { builtin: 'logo-chu' } : { assetId: 'a1' },
        ),
      }
    : design(10, avecCalendrier)
  const ecritures: PdfDesignContent[] = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    const chemin = new URL(url).pathname
    if (method === 'GET') {
      if (chemin.endsWith('/pdf-assets/a1')) {
        return {
          ok: true,
          status: 200,
          url,
          json: async () => ({ mimeType: 'image/png', base64: 'AAAA' }),
        }
      }
      if (chemin.endsWith('/pdf-assets')) {
        return {
          ok: true,
          status: 200,
          url,
          json: async () => [
            { id: 'a1', fileName: 'fond.png', mimeType: 'image/png' },
          ],
        }
      }
      if (!chemin.endsWith('/pdf-designs')) {
        return { ok: true, status: 200, url, json: async () => [] }
      }
      return {
        ok: true,
        status: 200,
        url,
        json: async () => {
          if (delaiGet > 0) {
            await new Promise((r) => setTimeout(r, delaiGet))
          }
          return { presets: [], designs: [enBase] }
        },
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

describe('editeur de design, les pages', () => {
  it('montre une vignette par page', async () => {
    monter(true)
    expect(await screen.findByTestId('page-cover')).toBeInTheDocument()
    expect(screen.getByTestId('page-calendrier')).toBeInTheDocument()
  })

  it('ajoute une page et s y place', async () => {
    monter()
    await screen.findByTestId('page-cover')

    await userEvent.click(
      screen.getByRole('button', { name: /Ajouter une page/ }),
    )

    await waitFor(() => {
      expect(screen.getAllByTestId(/^page-/)).toHaveLength(2)
    })
  })

  // Review Focus 5 : une page calendrier n'a pas de toile. L'editeur doit le dire.
  it('explique qu une page calendrier ne se compose pas', async () => {
    monter(true)
    // La vignette EST le bouton depuis que les pages sont en colonne : plus de rangee de
    // boutons sous chacune, la suppression est passee dans l'inspecteur.
    await userEvent.click(await screen.findByTestId('page-calendrier'))

    // L'inspecteur l'explique, et la toile en montre la forme sans inventer de planning.
    expect(
      screen.getByText(/remplie à l'export avec les rendez-vous du patient/i),
    ).toBeInTheDocument()
    expect(screen.getByTestId('apercu-calendrier')).toBeInTheDocument()
  })

  it('ne propose pas une seconde page calendrier', async () => {
    monter(true)
    await screen.findByTestId('page-cover')
    expect(
      screen.queryByRole('button', { name: /Ajouter le calendrier/ }),
    ).not.toBeInTheDocument()
  })

  // Revue de branche, C1 : PERTE DE DONNEE. Pendant que la requete est en vol, `useEdition`
  // tourne sur un contenu VIDE. La bande etait montee sans garde, donc « Ajouter une page »
  // repondait — et comme la resynchronisation ne se declenche que `!modifie`, ce geste la
  // condamnait : le design arrive, l'ecran garde la page vierge, et l'enregistrement ecrase
  // toutes les pages du design par celle-la.
  it('ne montre pas la bande tant que le design n est pas arrive', async () => {
    monter(false, 600)

    // On attend que l'ECRAN soit monte — sinon on mesurerait seulement que le routeur n'a
    // pas encore rendu le composant, ce qui ne prouve rien de la garde.
    await screen.findByRole('button', { name: /Aperçu PDF/ })
    expect(screen.queryByTestId('page-cover')).not.toBeInTheDocument()

    expect(
      screen.queryByRole('button', { name: /Ajouter une page/ }),
    ).not.toBeInTheDocument()

    // Et elle arrive bien une fois le design charge.
    expect(await screen.findByTestId('page-cover')).toBeInTheDocument()
  })

  it('garde les pages du design quand on clique pendant le chargement', async () => {
    const { ecritures } = monter(false, 600)

    await screen.findByRole('button', { name: /Aperçu PDF/ })
    // Le geste le plus banal, au pire moment : on clique avant que le design soit la.
    const ajouter = screen.queryByRole('button', { name: /Ajouter une page/ })
    if (ajouter) {
      await userEvent.click(ajouter)
    }
    await screen.findByTestId('page-cover')

    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))
    await new Promise((r) => setTimeout(r, 200))

    // Rien n'est enregistre : il n'y avait rien a enregistrer.
    for (const ecrit of ecritures) {
      expect(ecrit.pages.map((p) => p.id)).toContain('cover')
    }
  })

  // Etape 4 : les octets d'une image deposee sont demandes au serveur et donnes aux deux
  // moteurs. Sans ce chemin, l'image s'affiche dans l'inspecteur mais nulle part sur la page.
  it('montre une image deposee sur la toile', async () => {
    monter(false, 0, 'asset')

    // DEUX occurrences, et c'est le fait interessant : la toile et sa vignette dans la bande
    // rendent la meme page par le meme moteur, donc les deux doivent porter les octets.
    const images = await screen.findAllByRole('presentation')
    expect(images).toHaveLength(2)
    for (const image of images) {
      expect(image).toHaveAttribute('src', 'data:image/png;base64,AAAA')
    }
  })

  // REVUE DE BRANCHE, CRITIQUE. L'extraction de l'editeur avait fait resoudre les octets sur
  // `design.content` — la version du SERVEUR — au lieu de `contenu`, l'etat vivant. Choisir
  // une image dans l'inspecteur n'ecrit que dans `contenu` : son `assetId` n'etait donc pas
  // demande, `sources` restait vide, et la toile rendait `null`. L'utilisateur posait et
  // redimensionnait un element INVISIBLE, qui n'apparaissait qu'apres « Enregistrer ».
  it('montre une image choisie dans l inspecteur, avant tout enregistrement', async () => {
    monter(false, 0, 'livree')

    // L'element part d'une image LIVREE : on bascule vers l'image deposee du service.
    const poignee = await screen.findByTestId('poignee-deplacement-fond')
    await userEvent.click(poignee)
    await userEvent.click(screen.getByLabelText('Image'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'fond.png' }),
    )

    await waitFor(() => {
      const images = screen.getAllByRole('presentation')
      expect(images.length).toBeGreaterThan(0)
      for (const image of images) {
        expect(image).toHaveAttribute('src', 'data:image/png;base64,AAAA')
      }
    })
  })

  it('propose les images du service dans l inspecteur', async () => {
    monter(false, 0, 'asset')

    const poignee = await screen.findByTestId('poignee-deplacement-fond')
    await userEvent.click(poignee)
    await userEvent.click(screen.getByLabelText('Image'))

    expect(
      await screen.findByRole('option', { name: 'fond.png' }),
    ).toBeInTheDocument()
  })

  // Un fichier au-dela de 2 Mo n'est pas envoye : au-dela de la limite de corps du back,
  // Fastify refuse avant le schema et l'utilisateur recevrait un 413 nu. Le message doit
  // donc venir d'ici, et NOMMER la limite.
  it('refuse un fichier trop gros en nommant la limite, sans l envoyer', async () => {
    monter(false, 0, 'asset')

    const poignee = await screen.findByTestId('poignee-deplacement-fond')
    await userEvent.click(poignee)
    const trop = new File([new Uint8Array(3 * 1024 * 1024)], 'trop.png', {
      type: 'image/png',
    })
    await userEvent.upload(
      screen.getByLabelText(/Déposer un PNG ou JPEG/),
      trop,
    )

    await waitFor(() => {
      expect(
        useToastStore
          .getState()
          // `message` est un ReactNode : on le lit comme du texte, c'est tout ce qu'on veut.
          .toasts.some((t) => /2 Mo/.test(String(t.message ?? ''))),
      ).toBe(true)
    })
    // Et rien n'est parti sur le reseau.
    const fetchMock = globalThis.fetch as unknown as {
      mock: { calls: [RequestInfo | URL, RequestInit?][] }
    }
    const depots = fetchMock.mock.calls.filter(
      ([, init]) => (init?.method ?? 'GET') === 'POST',
    )
    expect(depots).toHaveLength(0)
  })
})
