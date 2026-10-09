import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { TenantContext } from '@/types/auth.ts'
import AddThematicForm from './addThematicForm.tsx'

const service: TenantContext = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN',
  serviceRole: 'COORDINATEUR',
  soignantId: null,
}

// Toute lecture repond une liste vide ; seul le POST de creation est observe.
const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = input.toString()
  const method = init?.method ?? 'GET'
  if (url.includes('/thematic') && method === 'POST') {
    return { ok: true, status: 201, url, json: async () => ({ id: 't1' }) }
  }
  if (method === 'GET') {
    return { ok: true, status: 200, url, json: async () => [] }
  }
  throw new Error(`Appel fetch non attendu dans ce test : ${method} ${url}`)
})

const corpsCree = () => {
  const call = fetchMock.mock.calls.find(
    ([url, init]) =>
      String(url).includes('/thematic') && init?.method === 'POST',
  )
  return JSON.parse(String(call?.[1]?.body))
}

beforeEach(() => {
  useAuthStore.setState({ context: service })
  useToastStore.setState({ toasts: [] })
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AddThematicForm />
    </QueryClientProvider>,
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ouvrir = () =>
  userEvent.click(screen.getByRole('button', { name: /nouvelle thématique/i }))

const ajouter = () =>
  userEvent.click(screen.getByRole('button', { name: /^ajouter$/i }))

describe('AddThematicForm — consigne du programme PDF', () => {
  it('envoie la consigne saisie à la création', async () => {
    await ouvrir()
    await userEvent.type(screen.getByLabelText('Nom'), 'Diabète')
    await userEvent.type(
      screen.getByLabelText('Consigne affichée dans le programme PDF'),
      'Un seul rendez-vous parmi : %dates%',
    )
    await ajouter()

    await waitFor(() => {
      expect(corpsCree().pdfNotice).toBe('Un seul rendez-vous parmi : %dates%')
    })
  })

  it('une consigne laissée vide part en null', async () => {
    await ouvrir()
    await userEvent.type(screen.getByLabelText('Nom'), 'Diabète')
    await ajouter()

    await waitFor(() => {
      expect(corpsCree().pdfNotice).toBeNull()
    })
  })
})
