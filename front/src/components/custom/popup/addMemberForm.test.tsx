import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { User } from '@/types/auth.ts'

import AddMemberForm from './addMemberForm.tsx'

// Revue finale de l'étape 4a, Important n°2 : ce formulaire (rattacher un
// compte DÉJÀ créé) construisait son menu de services depuis
// `user.establishments[].services` — les appartenances de service de
// l'ADMINISTRATEUR CONNECTÉ, données de `/me` — au lieu de la liste des
// services de L'ÉTABLISSEMENT (`GET /e/:establishmentId/admin/services`,
// même source qu'`EditMemberForm`). Un administrateur membre d'un seul
// service de l'établissement ne pouvait donc rattacher personne à l'autre :
// le service n'apparaissait tout simplement pas dans le menu.

const adminMembreDUnSeulService: User = {
  id: 'u1',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
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
  { id: 'svcA', name: 'Cardiologie', createdAt: '2026-01-01T00:00:00.000Z', deactivatedAt: null },
  { id: 'svcB', name: 'Pneumologie', createdAt: '2026-01-01T00:00:00.000Z', deactivatedAt: null },
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

const renderForm = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AddMemberForm />
    </QueryClientProvider>,
  )
  return queryClient
}

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: adminMembreDUnSeulService,
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

describe('AddMemberForm', () => {
  it("propose TOUS les services de l'etablissement, pas seulement ceux de l'administrateur connecte", async () => {
    vi.stubGlobal('fetch', buildFetchMock([routeSoignants, routeServices(servicesFixture)]))
    renderForm()

    await userEvent.click(screen.getByRole('button', { name: /ajouter un membre/i }))
    await userEvent.click(screen.getByLabelText('Service'))

    // `getByRole('option', …)` plutôt que `getByText` : ce champ vit dans un
    // vrai `<form>`, donc le `Select` (radix-ui) mirroire ses options dans
    // un `<select>` natif caché (`aria-hidden`) en plus du menu ouvert —
    // voir le même commentaire dans `createMemberAccountForm.test.tsx`.
    expect(await screen.findByRole('option', { name: 'Cardiologie' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Pneumologie' })).toBeInTheDocument()
  })

  it('rattache un compte existant avec le service choisi dans la liste complete', async () => {
    const fetchMock = buildFetchMock([
      routeSoignants,
      routeServices(servicesFixture),
      {
        match: (url, method) => url.endsWith('/admin/members') && method === 'POST',
        respond: () => ({
          ok: true,
          status: 201,
          json: async () => ({ id: 'm2', role: 'MEMBER', serviceMemberships: [] }),
        }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await userEvent.click(screen.getByRole('button', { name: /ajouter un membre/i }))
    await userEvent.type(screen.getByLabelText(/e-mail/i), 'membre@chu.fr')

    // Choisir Pneumologie : le service dont l'administrateur connecté n'est
    // PAS lui-même membre — c'est exactement le cas que le bug fermait.
    await userEvent.click(screen.getByLabelText('Service'))
    await userEvent.click(await screen.findByRole('option', { name: 'Pneumologie' }))

    await userEvent.click(screen.getByLabelText(/rôle dans le service/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Intervenant' }))

    await userEvent.click(screen.getByRole('button', { name: /^ajouter$/i }))

    const postCall = await vi.waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) => String(url).endsWith('/admin/members') && init?.method === 'POST',
      )
      if (!call) {
        throw new Error('pas encore appelé')
      }
      return call
    })
    const body = JSON.parse(String(postCall[1]?.body))
    expect(body.services).toEqual([{ serviceId: 'svcB', role: 'INTERVENANT' }])
  })
})
