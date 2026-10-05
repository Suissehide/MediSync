import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildAccessLinkUrl } from '@/libs/accessLink.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { User } from '@/types/auth.ts'
import InviteServiceMemberForm from './inviteServiceMemberForm.tsx'

// MDS-17. LA PROPRIETE QUI COMPTE ICI EST LA DISTINCTION DES DEUX ISSUES, parce que c'est elle
// qui dit au coordinateur s'il a quelque chose a transmettre. Un compte neuf recoit un LIEN DE
// PREMIERE CONNEXION — un mot de passe a usage unique, affiche une seule fois ; un compte deja
// rattache a l'etablissement n'en recoit AUCUN (`accessLink: null`) et garde son mot de passe.
// Les confondre laisserait soit une personne sans acces, soit un coordinateur a attendre un lien
// qui n'arrivera jamais.
//
// Le jeton est traite avec la meme discipline que dans `createMemberAccountForm.test.ts` : il ne
// doit vivre que dans le cache des MUTATIONS, et disparaitre a la fermeture de la popup.

const JETON = 'jeton-invitation-service-ne-jamais-fuiter'
const LIEN_ATTENDU = buildAccessLinkUrl(JETON)

const coordinateur: User = {
  id: 'u1',
  email: 'coord@chu.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [{ id: 'svcA', name: 'Cardiologie', role: 'COORDINATEUR' }],
    },
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

const routeInvitation = (body: unknown, status = 201): Route => ({
  match: (url, method) => url.endsWith('/membres') && method === 'POST',
  respond: () => ({ ok: status < 400, status, json: async () => body }),
})

// Pas de `gcTime: 0` : une entree sans observateur disparaitrait du cache avant l'assertion, et
// la garde du jeton serait vraie par construction.
const renderForm = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <InviteServiceMemberForm />
    </QueryClientProvider>,
  )
}

const inviter = async (email = 'nouvelle@chu.fr') => {
  await userEvent.click(screen.getByRole('button', { name: /^inviter$/i }))
  await userEvent.type(screen.getByLabelText(/e-mail/i), email)
  const boutons = screen.getAllByRole('button', { name: /^inviter$/i })
  await userEvent.click(boutons[boutons.length - 1] as HTMLElement)
}

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: coordinateur,
    context: {
      establishmentId: 'e1',
      serviceId: 'svcA',
      establishmentRole: 'MEMBER',
      serviceRole: 'COORDINATEUR',
      soignantId: null,
    },
  })
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('InviteServiceMemberForm', () => {
  it('affiche le lien de premiere connexion, une seule fois, pour un compte neuf', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([routeInvitation({ accessLink: { token: JETON } })]),
    )
    renderForm()

    await inviter()

    expect(await screen.findByText(LIEN_ATTENDU)).toBeInTheDocument()
    expect(
      screen.getByText(/il ne sera plus jamais affiché/i),
    ).toBeInTheDocument()

    // LA PREUVE QUI COMPTE : rouvrir. Le composant reste monte (Radix ne demonte que le CONTENU
    // de la popup), donc sans `reset()` la donnee de mutation survivrait et le jeton
    // reapparaitrait ici.
    await userEvent.click(screen.getByRole('button', { name: /fermer/i }))
    await userEvent.click(screen.getByRole('button', { name: /^inviter$/i }))
    expect(screen.queryByText(LIEN_ATTENDU)).not.toBeInTheDocument()
  })

  it('dit explicitement qu il n y a aucun lien a transmettre pour un compte deja rattache', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([routeInvitation({ accessLink: null })]),
    )
    renderForm()

    await inviter('deja@chu.fr')

    expect(
      await screen.findByText(/son mot de passe habituel/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/il ne sera plus jamais affiché/i),
    ).not.toBeInTheDocument()
  })

  // Le 400 du back est volontairement OPAQUE (compte super-admin, compte rattache ailleurs) :
  // l'ecran ne doit pas reconstruire la distinction, ce serait rendre l'oracle que le back
  // refuse de donner.
  it('reste opaque sur un refus, et ne montre aucun lien', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock([
        routeInvitation(
          { message: 'This e-mail address cannot be added as a member' },
          400,
        ),
      ]),
    )
    renderForm()

    await inviter('super@chu.fr')

    const toasts = await vi.waitFor(() => {
      const current = useToastStore.getState().toasts
      expect(current.length).toBeGreaterThan(0)
      return current
    })
    const texte = JSON.stringify(toasts)
    expect(texte).not.toMatch(/super-admin/i)
    expect(texte).not.toMatch(/autre établissement.*existe/i)
    expect(screen.queryByText(LIEN_ATTENDU)).not.toBeInTheDocument()
  })
})
