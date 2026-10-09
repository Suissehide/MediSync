import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { TenantContext } from '@/types/auth.ts'
import type { Thematic } from '@/types/thematic.ts'
import EditThematicSoignantsForm from './editThematicSoignantsForm.tsx'

const service: TenantContext = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN',
  serviceRole: 'COORDINATEUR',
  soignantId: null,
}

const thematicFixture: Thematic = {
  id: 't1',
  name: 'Diabète',
  duration: 30,
  pdfNotice: null,
  role: 'REACTUALISATION',
  soignants: [],
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

const routePatch: Route = {
  match: (url, method) => url.includes('/thematic/t1') && method === 'PATCH',
  respond: () => ({
    ok: true,
    status: 200,
    json: async () => ({ ...thematicFixture }),
  }),
}

const renderForm = (fetchMock: ReturnType<typeof buildFetchMock>) => {
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <EditThematicSoignantsForm
        thematic={thematicFixture}
        soignantOptions={[]}
      />
    </QueryClientProvider>,
  )
  return queryClient
}

const ouvrir = async () => {
  await userEvent.click(
    screen.getByRole('button', { name: /modifier la thématique/i }),
  )
}

const enregistrer = async () => {
  await userEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }))
}

const corpsEnvoye = (fetchMock: ReturnType<typeof buildFetchMock>) => {
  const call = fetchMock.mock.calls.find(
    ([url, init]) =>
      String(url).includes('/thematic/t1') && init?.method === 'PATCH',
  )
  return JSON.parse(String(call?.[1]?.body))
}

beforeEach(() => {
  useAuthStore.setState({ context: service })
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EditThematicSoignantsForm — rôle dans les indicateurs', () => {
  it('choisir « Bilan de fin » envoie un PATCH avec uniquement ce champ modifié', async () => {
    const fetchMock = buildFetchMock([routePatch])
    renderForm(fetchMock)
    await ouvrir()

    await waitFor(() => {
      expect(
        screen.getByLabelText('Rôle dans les indicateurs'),
      ).toHaveTextContent('Réactualisation')
    })

    await userEvent.click(screen.getByLabelText('Rôle dans les indicateurs'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Bilan de fin' }),
    )

    await enregistrer()

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes('/thematic/t1') && init?.method === 'PATCH',
        ),
      ).toBe(true)
    })

    expect(corpsEnvoye(fetchMock)).toEqual({ role: 'BILAN_DE_FIN' })
  })

  it('choisir « Aucun » sur une thématique qui avait un rôle envoie role:null', async () => {
    const fetchMock = buildFetchMock([routePatch])
    renderForm(fetchMock)
    await ouvrir()

    await waitFor(() => {
      expect(
        screen.getByLabelText('Rôle dans les indicateurs'),
      ).toHaveTextContent('Réactualisation')
    })

    await userEvent.click(screen.getByLabelText('Rôle dans les indicateurs'))
    await userEvent.click(await screen.findByRole('option', { name: 'Aucun' }))

    await enregistrer()

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes('/thematic/t1') && init?.method === 'PATCH',
        ),
      ).toBe(true)
    })

    expect(corpsEnvoye(fetchMock)).toEqual({ role: null })
  })
})
