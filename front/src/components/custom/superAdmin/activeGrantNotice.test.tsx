import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useLastGrantStore } from '@/store/useLastGrantStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { User } from '@/types/auth.ts'

import { ActiveGrantNotice } from './activeGrantNotice.tsx'

// Tour de correction 1, Important n°2 : « `/me` porte déjà la réponse à la
// question des octrois, et le front la jette. » L'écran de détail doit
// montrer que le super-admin connecté a déjà un octroi actif sur
// l'établissement consulté — ce qui décourage le doublon (le back refuse de
// toute façon un second octroi actif sur le même établissement, voir
// `superAdminGrant.domain.ts`, `ACTIVE_GRANT_EXISTS`) — et rendre
// `useSuperAdminRevokeGrant` atteignable pour l'octroi qu'on vient de créer.

const superAdminAvecOctroi: User = {
  id: 'sa1',
  email: 'super@medisync.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: true,
  establishments: [{ id: 'e1', name: 'CHU', role: 'ADMIN', soignantId: null, services: [], origine: 'octroi' }],
}

const superAdminSansOctroiIci: User = {
  id: 'sa1',
  email: 'super@medisync.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: true,
  establishments: [],
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
    return { ...route.respond(), url }
  })

const renderNotice = (establishmentId = 'e1') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ActiveGrantNotice establishmentId={establishmentId} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  useLastGrantStore.setState({ grantIdByEstablishment: {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.setState({ isAuthenticated: false, user: null, context: null })
})

describe('ActiveGrantNotice', () => {
  it("ne montre rien quand le compte n'a pas d'octroi sur cet etablissement", () => {
    useAuthStore.setState({ isAuthenticated: true, user: superAdminSansOctroiIci, context: null })
    renderNotice()

    expect(screen.queryByText(/octroi/i)).not.toBeInTheDocument()
  })

  it("signale l'octroi actif mais ne propose pas de le revoquer sans identifiant connu", () => {
    useAuthStore.setState({ isAuthenticated: true, user: superAdminAvecOctroi, context: null })
    renderNotice()

    expect(screen.getByText(/acces actif|accès actif/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /revoquer|révoquer/i })).not.toBeInTheDocument()
  })

  it("propose de revoquer l'octroi cree dans cette session, et appelle DELETE", async () => {
    useAuthStore.setState({ isAuthenticated: true, user: superAdminAvecOctroi, context: null })
    useLastGrantStore.setState({ grantIdByEstablishment: { e1: 'grant-123' } })

    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.endsWith('/super-admin/grants/grant-123') && method === 'DELETE',
        respond: () => ({ ok: true, status: 204, json: async () => null }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderNotice()

    await userEvent.click(screen.getByRole('button', { name: /revoquer|révoquer/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/super-admin/grants/grant-123'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
