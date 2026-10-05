import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildAccessLinkUrl } from '@/libs/accessLink.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { User } from '@/types/auth.ts'
import CreateMemberAccountForm from './createMemberAccountForm.tsx'

// Onglet des membres : « le lien s'affiche UNE SEULE
// FOIS, avec un bouton de copie et la mention qu'il ne sera plus affiché ».
// LE JETON EST UN MOT DE PASSE À USAGE UNIQUE — même exigence, même forme
// de garde, que `accountSearchPanel.test.tsx` : quatre canaux distincts, chacun éprouvé par une
// injection séparée.

const JETON = 'jeton-de-test-compte-neuf-ne-jamais-fuiter'
// L'écran affichait le jeton NU alors
// qu'il annonce un « lien à usage unique » — voir `buildAccessLinkUrl`.
const LIEN_ATTENDU = buildAccessLinkUrl(JETON)

const admin: User = {
  id: 'u1',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [{ id: 'e1', name: 'CHU', role: 'ADMIN', services: [] }],
}

// L'administrateur connecte
// n'est membre que de Cardiologie (`admin.establishments[0].services`,
// donnee de `/me`) — mais l'etablissement a DEUX services. Le menu doit
// proposer les deux, pas seulement celui de l'administrateur : ce
// formulaire cree un compte pour QUELQU'UN D'AUTRE, dans SON etablissement,
// pas dans le sous-ensemble de services de la personne qui remplit le
// formulaire.
const adminMembreDUnSeulService: User = {
  ...admin,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'ADMIN',
      services: [{ id: 'svcA', name: 'Cardiologie', role: 'COORDINATEUR' }],
    },
  ],
}

const servicesFixture = [
  {
    id: 'svcA',
    name: 'Cardiologie',
    createdAt: '2026-01-01T00:00:00.000Z',
    deactivatedAt: null,
  },
  {
    id: 'svcB',
    name: 'Pneumologie',
    createdAt: '2026-01-01T00:00:00.000Z',
    deactivatedAt: null,
  },
]

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

const routeSoignants: Route = {
  match: (url, method) => url.endsWith('/admin/soignant') && method === 'GET',
  respond: () => ({ ok: true, status: 200, json: async () => [] }),
}

const routeServices = (services: unknown[] = []): Route => ({
  match: (url, method) => url.endsWith('/admin/services') && method === 'GET',
  respond: () => ({ ok: true, status: 200, json: async () => services }),
})

// PAS de `gcTime: 0` ici, pour la même raison qu'`accountSearchPanel.test.tsx` :
// un `gcTime` nul ferait disparaître du cache toute entrée sans observateur
// avant l'assertion, rendant le test du jeton vrai PAR CONSTRUCTION.
const renderForm = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <CreateMemberAccountForm />
    </QueryClientProvider>,
  )
  return queryClient
}

const remplirEtCreer = async () => {
  await userEvent.click(
    screen.getByRole('button', { name: /inviter un membre/i }),
  )
  await userEvent.type(screen.getByLabelText(/e-mail/i), 'nouveau@chu.fr')
  await userEvent.click(screen.getByRole('button', { name: /^inviter$/i }))
}

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: admin,
    context: {
      establishmentId: 'e1',
      serviceId: null,
      establishmentRole: 'ADMIN',
      serviceRole: null,
      soignantId: null,
    },
  })
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CreateMemberAccountForm', () => {
  it("affiche le lien une seule fois, avec un bouton de copie et la mention qu'il ne sera plus affiché", async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeSoignants,
        routeServices(),
        {
          match: (url, method) =>
            url.endsWith('/admin/members/account') && method === 'POST',
          respond: () => ({
            ok: true,
            status: 201,
            json: async () => ({
              member: { id: 'm1', role: 'MEMBER', serviceMemberships: [] },
              accessLink: { token: JETON },
            }),
          }),
        },
      ]),
    )
    renderForm()

    await remplirEtCreer()

    expect(await screen.findByText(LIEN_ATTENDU)).toBeInTheDocument()
    expect(
      screen.getByText(/il ne sera plus jamais affiché/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /copier le lien/i }),
    ).toBeInTheDocument()

    // Fermer la popup : Radix demonte simplement le CONTENU au ferme, donc
    // `queryByText(LIEN_ATTENDU)` serait deja absent ici meme SANS aucune
    // remise a zero de la mutation - cette seule assertion ne prouve rien
    // (demontrable en retirant `reset()` : les deux tests restent verts).
    await userEvent.click(screen.getByRole('button', { name: /fermer/i }))
    expect(screen.queryByText(LIEN_ATTENDU)).not.toBeInTheDocument()

    // LA PREUVE QUI COMPTE : rouvrir. Le composant reste MONTE d'un bout a
    // l'autre (seul le contenu de la popup Radix se demonte/remonte), donc
    // la donnee de la mutation (`createMemberAccount.data`) survit tant que
    // rien ne l'a explicitement remise a zero. Sans `reset()`, le jeton
    // reapparaitrait ici.
    await userEvent.click(
      screen.getByRole('button', { name: /inviter un membre/i }),
    )
    expect(screen.queryByText(LIEN_ATTENDU)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument()
  })

  it("le jeton n'atterrit jamais ailleurs qu'à l'écran (quatre canaux)", async () => {
    const consoleSpies = (
      ['log', 'warn', 'error', 'info', 'debug'] as const
    ).map((methode) =>
      vi.spyOn(console, methode).mockImplementation(() => undefined),
    )

    const fetchMock = buildFetchMock([
      routeSoignants,
      routeServices(),
      {
        match: (url, method) =>
          url.endsWith('/admin/members/account') && method === 'POST',
        respond: () => ({
          ok: true,
          status: 201,
          json: async () => ({
            member: { id: 'm1', role: 'MEMBER', serviceMemberships: [] },
            accessLink: { token: JETON },
          }),
        }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = renderForm()

    await remplirEtCreer()

    expect(await screen.findByText(LIEN_ATTENDU)).toBeInTheDocument()

    // Canal 1/4 — jamais dans la VALEUR d'une entrée du cache des requêtes.
    const cachesAvecLeJetonEnValeur = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => JSON.stringify(query.state.data ?? '').includes(JETON))
    expect(cachesAvecLeJetonEnValeur).toEqual([])

    // Canal 2/4 — jamais dans la CLÉ d'une entrée du cache.
    const cachesAvecLeJetonEnCle = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => JSON.stringify(query.queryKey).includes(JETON))
    expect(cachesAvecLeJetonEnCle).toEqual([])

    // Canal 3/4 — jamais dans l'URL d'un appel réseau.
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain(JETON)
    }

    // Canal 4/4 — jamais dans un journal de console, quelle que soit la
    // méthode utilisée.
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(JETON)
      }
    }
  })

  // La fixture ci-dessus portait `services: []`
  // (voir le commentaire au sommet du fichier), ce qui rendait ce defaut
  // invisible — le menu n'etait jamais exerce non vide. Etablissement a
  // DEUX services, administrateur membre d'UN SEUL : le menu doit proposer
  // les deux.
  it("propose TOUS les services de l'etablissement, pas seulement ceux de l'administrateur connecte", async () => {
    useAuthStore.setState({ user: adminMembreDUnSeulService })
    vi.stubGlobal(
      'fetch',
      buildFetchMock([routeSoignants, routeServices(servicesFixture)]),
    )
    renderForm()

    await userEvent.click(
      screen.getByRole('button', { name: /inviter un membre/i }),
    )
    await userEvent.click(screen.getByLabelText('Service'))

    // `getByRole('option', …)` plutôt que `getByText` : le composant `Select`
    // (radix-ui) rend, en plus du menu ouvert, un `<select>` natif caché
    // (`aria-hidden`, pont d'accessibilité/formulaire) qui MIROIRE les mêmes
    // libellés en `<option>` dès que le champ vit dans un vrai `<form>`
    // (c'est le cas ici, à la différence d'`EditMemberForm`) — `getByText`
    // y trouve donc deux éléments pour un même libellé. `getByRole` exclut
    // les éléments `aria-hidden`, donc uniquement l'option du menu ouvert.
    expect(
      await screen.findByRole('option', { name: 'Cardiologie' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Pneumologie' }),
    ).toBeInTheDocument()
  })
})
