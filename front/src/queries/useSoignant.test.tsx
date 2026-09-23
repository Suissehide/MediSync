import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'

import { useEstablishmentSoignantsQuery } from './useSoignant.ts'

// Contexte d'un écran d'administration d'établissement (voir
// `routes/_authenticated/e/$establishmentId/admin.tsx`) : aucun service.
// C'est exactement le contexte qui faisait lever `tenantApiUrl` depuis
// `useSoignantQueries` (constat critique de la revue, tâche 8, tour de
// correction 1) — l'écran des membres affichait alors une erreur technique
// à chaque visite, et le sélecteur « Fonction » restait vide, en ajout comme
// en édition.
const establishmentOnlyContext = {
  establishmentId: 'e1',
  serviceId: null,
  establishmentRole: 'ADMIN' as const,
  serviceRole: null,
  soignantId: null,
}

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useEstablishmentSoignantsQuery — tient sans service en contexte', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: establishmentOnlyContext })
    useToastStore.setState({ toasts: [] })
  })

  it('interroge le préfixe d établissement, pas celui de service, et ne déclenche aucune erreur', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useEstablishmentSoignantsQuery(), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    // Pas d'erreur : `useSoignantQueries` (préfixe de service) aurait
    // échoué ici, `tenantApiUrl` levant volontairement sans service (voir
    // `config.constant.test.ts`).
    expect(result.current.error).toBeNull()

    const [requestedUrl] = fetchMock.mock.calls[0] as [string]
    expect(requestedUrl).toMatch(/\/e\/e1\/admin\/soignant$/)
    expect(requestedUrl).not.toMatch(/\/s\//)

    // Le symptôme exact du défaut corrigé : une erreur technique poussée en
    // toast à l'administrateur, à chaque visite de l'écran des membres.
    expect(useToastStore.getState().toasts).toHaveLength(0)

    vi.unstubAllGlobals()
  })
})
