import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useToastStore } from '@/store/useToastStore.ts'

import { AccountSearchPanel } from './accountSearchPanel.tsx'

// `main.tsx` enregistre ce greffon au démarrage ; l'affichage du dernier
// accès en dépend (`dayjs.utc`). Le harnais de test ne passe pas par
// `main.tsx` et doit donc le reproduire (même convention que
// `navbar.test.tsx`, `addPatientForm.test.tsx`).
dayjs.extend(utc)

// Task-12-brief.md, step 3 : « la recherche d'un compte, qui répond à
// "untel ne voit plus ses patients", avec réémission de lien ». Le jeton
// rendu par la réémission est une donnée à usage unique : « ne doit jamais
// atterrir ailleurs qu'à l'écran — ni dans une clé de requête, ni dans une
// URL, ni dans un journal de console, ni dans le cache d'une requête ».

const JETON_UNIQUE = 'jeton-de-test-ne-jamais-fuiter'

type Route = {
  match: (url: string, method: string) => boolean
  respond: (
    url: string,
    init?: RequestInit,
  ) => { ok: boolean; status: number; json: () => Promise<unknown> }
}

const buildFetchMock = (routes: Route[]) =>
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    const route = routes.find((r) => r.match(url, method))
    if (!route) {
      throw new Error(`Appel fetch non attendu dans ce test : ${method} ${url}`)
    }
    const result = route.respond(url, init)
    return { ...result, url }
  })

const compteRecherche = {
  id: 'user-cuid-1',
  email: 'untel@chu.fr',
  firstName: 'Un',
  lastName: 'Tel',
  deactivatedAt: null,
  lastLoginAt: '2026-01-01T08:00:00.000Z',
  memberships: [
    {
      establishmentId: 'e1',
      establishmentName: 'CHU',
      role: 'MEMBER' as const,
      createdAt: '2025-06-01T00:00:00.000Z',
    },
  ],
}

const renderPanel = () => {
  // PAS de `gcTime: 0` ici, à la différence des autres harnais de ce
  // dépôt (`addPatientForm.test.tsx`) : un `gcTime` nul fait disparaître
  // du cache toute entrée sans observateur quasi immédiatement (un
  // `setTimeout(0)` planifié dès qu'elle devient inactive), ce qui rendrait
  // le test du jeton vrai PAR CONSTRUCTION — une vraie fuite écrite dans le
  // cache par un sabotage disparaîtrait avant l'assertion, sans rapport
  // avec le composant testé. Éprouvé : avec `gcTime: 0`, une fuite injectée
  // exprès dans `useSuperAdminReissueAccessLink` ne faisait PAS rougir ce
  // test.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AccountSearchPanel />
    </QueryClientProvider>,
  )
  return queryClient
}

const rechercher = async (email: string) => {
  await userEvent.type(screen.getByLabelText(/adresse e-mail/i), email)
  await userEvent.click(screen.getByRole('button', { name: /rechercher/i }))
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AccountSearchPanel', () => {
  it('affiche les rattachements du compte trouvé, sans donnée de patient', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        {
          match: (url, method) => url.includes('/super-admin/users?email=') && method === 'GET',
          respond: () => ({
            ok: true,
            status: 200,
            json: async () => compteRecherche,
          }),
        },
      ]),
    )
    renderPanel()

    await rechercher('untel@chu.fr')

    expect(await screen.findByText('untel@chu.fr')).toBeInTheDocument()
    expect(screen.getByText('CHU')).toBeInTheDocument()
  })

  it("le jeton reemis n'atterrit jamais ailleurs qu'a l'ecran", async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const urlAvant = window.location.href

    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        {
          match: (url, method) => url.includes('/super-admin/users?email=') && method === 'GET',
          respond: () => ({
            ok: true,
            status: 200,
            json: async () => compteRecherche,
          }),
        },
        {
          match: (url, method) =>
            url.endsWith('/super-admin/users/user-cuid-1/access-link') && method === 'POST',
          respond: () => ({
            ok: true,
            status: 201,
            json: async () => ({ accessLink: { token: JETON_UNIQUE } }),
          }),
        },
      ]),
    )
    const queryClient = renderPanel()

    await rechercher('untel@chu.fr')
    await screen.findByText('untel@chu.fr')

    await userEvent.click(
      screen.getByRole('button', { name: /réémettre un lien d'accès/i }),
    )

    // Affiché à l'écran : c'est le seul endroit où il doit apparaître.
    expect(await screen.findByText(JETON_UNIQUE)).toBeInTheDocument()

    // Jamais dans le cache des REQUÊTES (la réémission est une mutation ;
    // `getQueryData`/`getQueriesData`, ce que ce test imite ici en
    // parcourant `getQueryCache`, ne doivent jamais pouvoir le lire).
    const cachesAvecLeJeton = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => JSON.stringify(query.state.data ?? '').includes(JETON_UNIQUE))
    expect(cachesAvecLeJeton).toEqual([])

    // Jamais dans une URL.
    expect(window.location.href).toBe(urlAvant)
    for (const call of (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      expect(String(call[0])).not.toContain(JETON_UNIQUE)
    }

    // Jamais dans un journal de console.
    for (const call of [...consoleLog.mock.calls, ...consoleError.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(JETON_UNIQUE)
    }
  })
})
