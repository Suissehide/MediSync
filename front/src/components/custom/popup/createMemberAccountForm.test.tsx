import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { User } from '@/types/auth.ts'

import CreateMemberAccountForm from './createMemberAccountForm.tsx'

// Onglet des membres (tâche 13, step 3) : « le lien s'affiche UNE SEULE
// FOIS, avec un bouton de copie et la mention qu'il ne sera plus affiché ».
// LE JETON EST UN MOT DE PASSE À USAGE UNIQUE — même exigence, même forme
// de garde, que `accountSearchPanel.test.tsx` (tâche 12, tour de correction
// 1, Critique n°2) : quatre canaux distincts, chacun éprouvé par une
// injection séparée.

const JETON = 'jeton-de-test-compte-neuf-ne-jamais-fuiter'

const admin: User = {
  id: 'u1',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    { id: 'e1', name: 'CHU', role: 'ADMIN', soignantId: null, services: [] },
  ],
}

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
  await userEvent.click(screen.getByRole('button', { name: /créer un compte/i }))
  await userEvent.type(screen.getByLabelText(/e-mail/i), 'nouveau@chu.fr')
  await userEvent.click(screen.getByRole('button', { name: /^créer$/i }))
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
        {
          match: (url, method) => url.endsWith('/admin/members/account') && method === 'POST',
          respond: () => ({
            ok: true,
            status: 201,
            json: async () => ({
              member: { id: 'm1', role: 'MEMBER', soignantId: null, serviceMemberships: [] },
              accessLink: { token: JETON },
            }),
          }),
        },
      ]),
    )
    renderForm()

    await remplirEtCreer()

    expect(await screen.findByText(JETON)).toBeInTheDocument()
    expect(
      screen.getByText(/il ne sera plus jamais affiché/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copier l'identifiant/i })).toBeInTheDocument()

    // Fermer la popup : Radix demonte simplement le CONTENU au ferme, donc
    // `queryByText(JETON)` serait deja absent ici meme SANS aucune remise a
    // zero de la mutation - cette seule assertion ne prouve rien (Critique
    // n°2, tour de correction 1 : le relecteur a retire `reset()` et les
    // deux tests d'origine restaient verts).
    await userEvent.click(screen.getByRole('button', { name: /fermer/i }))
    expect(screen.queryByText(JETON)).not.toBeInTheDocument()

    // LA PREUVE QUI COMPTE : rouvrir. Le composant reste MONTE d'un bout a
    // l'autre (seul le contenu de la popup Radix se demonte/remonte), donc
    // la donnee de la mutation (`createMemberAccount.data`) survit tant que
    // rien ne l'a explicitement remise a zero. Sans `reset()`, le jeton
    // reapparaitrait ici.
    await userEvent.click(screen.getByRole('button', { name: /créer un compte/i }))
    expect(screen.queryByText(JETON)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument()
  })

  it("le jeton n'atterrit jamais ailleurs qu'à l'écran (quatre canaux)", async () => {
    const consoleSpies = (
      ['log', 'warn', 'error', 'info', 'debug'] as const
    ).map((methode) => vi.spyOn(console, methode).mockImplementation(() => undefined))

    const fetchMock = buildFetchMock([
      routeSoignants,
      {
        match: (url, method) => url.endsWith('/admin/members/account') && method === 'POST',
        respond: () => ({
          ok: true,
          status: 201,
          json: async () => ({
            member: { id: 'm1', role: 'MEMBER', soignantId: null, serviceMemberships: [] },
            accessLink: { token: JETON },
          }),
        }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = renderForm()

    await remplirEtCreer()

    expect(await screen.findByText(JETON)).toBeInTheDocument()

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
})
