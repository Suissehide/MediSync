import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLastGrantStore } from '@/store/useLastGrantStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import CreateGrantForm from './createGrantForm.tsx'

// Task-12-brief.md, step 2 : « bouton d'octroi avec motif obligatoire et
// durée ». Sans le garde du motif, « la moitié comptable du mécanisme ne
// vaut rien » (task-8-brief.md, repris ici côté front) : ces tests
// verrouillent que le formulaire REFUSE d'envoyer la requête tant que le
// motif est vide, ou que la durée sort de ]0, 24].

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

const renderForm = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateGrantForm establishmentId="e1" />
    </QueryClientProvider>,
  )
}

const ouvrir = async () => {
  await userEvent.click(
    screen.getByRole('button', { name: /accorder un accès/i }),
  )
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  useLastGrantStore.setState({ grantIdByEstablishment: {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CreateGrantForm — motif obligatoire et durée bornée', () => {
  it("n'envoie aucune requête tant que le motif est vide", async () => {
    const fetchMock = buildFetchMock([])
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await ouvrir()
    await userEvent.click(screen.getByRole('button', { name: /^s'accorder/i }))

    expect(
      await screen.findByText(/motif est obligatoire/i),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuse une durée hors de 1 à 24 heures', async () => {
    const fetchMock = buildFetchMock([])
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await ouvrir()
    await userEvent.type(
      screen.getByLabelText(/motif/i),
      'Compte bloqué, dépannage',
    )
    const dureeInput = screen.getByLabelText(/durée/i)
    await userEvent.clear(dureeInput)
    await userEvent.type(dureeInput, '48')
    await userEvent.click(screen.getByRole('button', { name: /^s'accorder/i }))

    expect(
      await screen.findByText(/comprise entre 1 et 24/i),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('envoie establishmentId, reason et durationHours quand la saisie est valide', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) =>
          url.endsWith('/super-admin/grants') && method === 'POST',
        respond: (_url, init) => ({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'g1',
            establishmentId: 'e1',
            reason: 'Compte bloqué, dépannage',
            grantedAt: '2026-01-01T00:00:00.000Z',
            expiresAt: '2026-01-01T04:00:00.000Z',
            revokedAt: null,
            _body: init?.body,
          }),
        }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await ouvrir()
    await userEvent.type(
      screen.getByLabelText(/motif/i),
      'Compte bloqué, dépannage',
    )
    await userEvent.click(screen.getByRole('button', { name: /^s'accorder/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      establishmentId: 'e1',
      reason: 'Compte bloqué, dépannage',
      durationHours: 4,
    })

    // Tour de correction 1, Important n°2 : `GET /me` ne rend jamais
    // l'identifiant d'un octroi, seulement son `origine` — le SEUL moment
    // où le front voit cet identifiant est cette réponse de création. Sans
    // le mémoriser ici, `ActiveGrantNotice` ne peut jamais proposer de
    // révoquer l'octroi qu'on vient soi-même de créer.
    await waitFor(() =>
      expect(useLastGrantStore.getState().grantIdByEstablishment.e1).toBe('g1'),
    )
  })
})
