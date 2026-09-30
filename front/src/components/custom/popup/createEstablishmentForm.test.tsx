import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildAccessLinkUrl } from '@/libs/accessLink.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { User } from '@/types/auth.ts'
import CreateEstablishmentForm from './createEstablishmentForm.tsx'

// « créer un établissement » — le back
// l'expose (`POST /super-admin/establishments`) mais aucun écran
// ne l'appelait. Même précédent que `createMemberAccountForm.tsx` :
// LE LIEN D'ACCÈS RENDU EST UN MOT DE PASSE À USAGE UNIQUE, affiché
// UNE SEULE FOIS, avec un bouton de copie et la mention qu'il ne sera plus
// affiché — et la preuve qui compte se fait en ROUVRANT, pas en fermant
// (Radix démonte le contenu à la fermeture, ce qui rendrait cette
// assertion vraie par construction).

const superAdmin: User = {
  id: 'u1',
  email: 'superadmin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: true,
  establishments: [],
}

const JETON = 'jeton-de-test-etablissement-neuf-ne-jamais-fuiter'
// L'écran affichait le jeton NU alors
// qu'il annonce un « lien à usage unique » — le destinataire recevait
// quelque chose qui n'est pas un lien. `LIEN_ATTENDU` est ce qui doit
// apparaître désormais à l'écran, pas `JETON` seul (voir `buildAccessLinkUrl`).
const LIEN_ATTENDU = buildAccessLinkUrl(JETON)

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

const routeCreate = (
  respond: Route['respond'] = () => ({
    ok: true,
    status: 201,
    json: async () => ({
      establishment: {
        id: 'e2',
        name: 'Nouvel hôpital',
        createdAt: '2026-01-01T00:00:00.000Z',
        deactivatedAt: null,
      },
      accessLink: { token: JETON },
    }),
  }),
): Route => ({
  match: (url, method) =>
    url.endsWith('/super-admin/establishments') && method === 'POST',
  respond,
})

// PAS de `gcTime: 0` (même raison qu'`accountSearchPanel.test.tsx`,
// `createMemberAccountForm.test.tsx` : un `gcTime` nul ferait disparaître du
// cache toute entrée sans observateur avant l'assertion, rendant le test du
// jeton vrai PAR CONSTRUCTION).
const renderForm = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <CreateEstablishmentForm />
    </QueryClientProvider>,
  )
  return queryClient
}

const remplirEtCreer = async () => {
  await userEvent.click(
    screen.getByRole('button', { name: /créer un établissement/i }),
  )
  await userEvent.type(
    screen.getByLabelText(/nom de l'établissement/i),
    'Nouvel hôpital',
  )
  await userEvent.type(
    screen.getByLabelText(/e-mail/i),
    'admin@nouvel-hopital.fr',
  )
  await userEvent.click(screen.getByRole('button', { name: /^créer$/i }))
}

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: superAdmin,
    context: null,
  })
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CreateEstablishmentForm', () => {
  it("affiche le lien une seule fois, avec un bouton de copie et la mention qu'il ne sera plus affiché", async () => {
    vi.stubGlobal('fetch', buildFetchMock([routeCreate()]))
    renderForm()

    await remplirEtCreer()

    expect(await screen.findByText(LIEN_ATTENDU)).toBeInTheDocument()
    expect(
      screen.getByText(/il ne sera plus jamais affiché/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /copier l'identifiant/i }),
    ).toBeInTheDocument()

    // Fermer ne prouve rien (Radix démonte le CONTENU au ferme, donc
    // `queryByText(LIEN_ATTENDU)` serait déjà absent même sans remise à zéro).
    await userEvent.click(screen.getByRole('button', { name: /fermer/i }))
    expect(screen.queryByText(LIEN_ATTENDU)).not.toBeInTheDocument()

    // LA PREUVE QUI COMPTE : rouvrir.
    await userEvent.click(
      screen.getByRole('button', { name: /créer un établissement/i }),
    )
    expect(screen.queryByText(LIEN_ATTENDU)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/nom de l'établissement/i)).toBeInTheDocument()
  })

  it("le jeton n'atterrit jamais ailleurs qu'a l'ecran (cache valeur, cache cle, url reseau, journal de console)", async () => {
    const consoleSpies = (
      ['log', 'warn', 'error', 'info', 'debug'] as const
    ).map((methode) =>
      vi.spyOn(console, methode).mockImplementation(() => undefined),
    )

    const fetchMock = buildFetchMock([routeCreate()])
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = renderForm()

    await remplirEtCreer()

    expect(await screen.findByText(LIEN_ATTENDU)).toBeInTheDocument()

    // Canal 1 — jamais dans la VALEUR d'une entrée du cache des requêtes.
    const cachesAvecLeJetonEnValeur = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => JSON.stringify(query.state.data ?? '').includes(JETON))
    expect(cachesAvecLeJetonEnValeur).toEqual([])

    // Canal 2 — jamais dans la CLÉ d'une entrée du cache.
    const cachesAvecLeJetonEnCle = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => JSON.stringify(query.queryKey).includes(JETON))
    expect(cachesAvecLeJetonEnCle).toEqual([])

    // Canal 3 — jamais dans l'URL d'un appel réseau (le jeton part dans le
    // CORPS de la réponse, jamais dans une URL d'appel).
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain(JETON)
    }

    // Canal 4 — jamais dans un journal de console, quelle que soit la
    // méthode utilisée.
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(JETON)
      }
    }

    // Canal 5 (historique de navigation) : sans objet ici — ce popup ne
    // navigue jamais et le jeton n'entre jamais dans une URL de page (à la
    // différence d'`access-link.tsx`, où le jeton arrive PAR l'URL). Rien
    // ne pousse ni ne remplace d'entrée d'historique depuis ce composant.
    expect(window.history.length).toBeGreaterThanOrEqual(1)
  })

  it('email invalide : refuse cote client avant tout appel reseau', async () => {
    const fetchMock = buildFetchMock([routeCreate()])
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await userEvent.click(
      screen.getByRole('button', { name: /créer un établissement/i }),
    )
    await userEvent.type(
      screen.getByLabelText(/nom de l'établissement/i),
      'Nouvel hôpital',
    )
    await userEvent.click(screen.getByRole('button', { name: /^créer$/i }))

    expect(
      await screen.findByText(/l'e-mail est nécessaire/i),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
