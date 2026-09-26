import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildAccessLinkUrl } from '@/libs/accessLink.ts'
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
// Revue finale de l'étape 4a, mineur : l'écran affichait le jeton NU alors
// qu'il annonce un « lien à usage unique » — voir `buildAccessLinkUrl`.
const LIEN_ATTENDU = buildAccessLinkUrl(JETON_UNIQUE)

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

  // Tour de correction 1, Mineur : « la réémission part sur un simple clic,
  // sans confirmation ». C'est un mot de passe à usage unique sur le
  // compte d'AUTRUI — le clic seul ne doit rien envoyer.
  it('demande une confirmation avant de reemettre le lien : le premier clic seul n envoie aucune requete', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/super-admin/users?email=') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => compteRecherche }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)
    renderPanel()

    await rechercher('untel@chu.fr')
    await screen.findByText('untel@chu.fr')

    await userEvent.click(
      screen.getByRole('button', { name: /réémettre un lien d'accès/i }),
    )

    expect(
      screen.getByText(/confirmez-vous|voulez-vous vraiment|sur de vouloir/i),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1) // la recherche seule, pas la reemission
  })

  it("le jeton reemis n'atterrit jamais ailleurs qu'a l'ecran", async () => {
    // Tour de correction 1, Critique n°2 : les QUATRE canaux que le
    // commentaire ci-dessus énumère, chacun avec sa propre garde — le
    // relecteur a démontré qu'une garde qui n'en couvre que deux (le cache
    // via `state.data` seul, `console.log`/`console.error` seuls) reste
    // verte devant une fuite écrite dans une CLÉ de cache et journalisée
    // par `console.warn`.
    const consoleSpies = (
      ['log', 'warn', 'error', 'info', 'debug'] as const
    ).map((methode) => vi.spyOn(console, methode).mockImplementation(() => undefined))
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
    await userEvent.click(
      screen.getByRole('button', { name: /confirmer la réémission/i }),
    )

    // Affiché à l'écran : c'est le seul endroit où il doit apparaître —
    // sous forme de LIEN complet, pas de jeton nu (revue finale, mineur).
    expect(await screen.findByText(LIEN_ATTENDU)).toBeInTheDocument()

    // Canal 1/4 — jamais dans la VALEUR d'une entrée du cache des requêtes
    // (la réémission est une mutation ; `getQueryData`/`getQueriesData`, ce
    // que ce test imite ici en parcourant `getQueryCache`, ne doivent
    // jamais pouvoir le lire).
    const cachesAvecLeJetonEnValeur = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => JSON.stringify(query.state.data ?? '').includes(JETON_UNIQUE))
    expect(cachesAvecLeJetonEnValeur).toEqual([])

    // Canal 2/4 — jamais dans la CLÉ d'une entrée du cache non plus : une
    // fuite peut se nicher dans la clé elle-même (`['lien-emis', jeton]`)
    // sans jamais apparaître dans `state.data`, et le canal 1 seul ne la
    // verrait pas.
    const cachesAvecLeJetonEnCle = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => JSON.stringify(query.queryKey).includes(JETON_UNIQUE))
    expect(cachesAvecLeJetonEnCle).toEqual([])

    // Canal 3/4 — jamais dans une URL (navigateur ou requête réseau).
    expect(window.location.href).toBe(urlAvant)
    for (const call of (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      expect(String(call[0])).not.toContain(JETON_UNIQUE)
    }

    // Canal 4/4 — jamais dans un journal de console, quelle que soit la
    // méthode utilisée (`console.warn` inclus, pas seulement `log`/`error`).
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(JETON_UNIQUE)
      }
    }
  })
})
