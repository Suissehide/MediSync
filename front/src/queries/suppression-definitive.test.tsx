import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { TenantContext } from '@/types/auth.ts'
import { useLocationMutations } from './useLocation.ts'

const service: TenantContext = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN',
  serviceRole: 'COORDINATEUR',
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

const reponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// `handleHttpError` ne lit pas le corps de la reponse : sans le passage
// explicite par `messageDuServeur`, le refus du serveur arriverait a l'ecran
// sous une forme generique qui ne dit pas CE QUI bloque — or c'est tout
// l'interet de ce refus.
describe('refus de suppression definitive', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: service })
    useToastStore.setState({ toasts: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('affiche le message du serveur, qui nomme ce qui bloque', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      reponse(409, {
        message:
          'Suppression impossible : encore utilisé par 3 créneaux modèles.',
      }),
    )

    const { result } = renderHook(() => useLocationMutations(), { wrapper })
    act(() => {
      result.current.deleteForeverLocation.mutate('l1')
    })

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1))
    const toast = useToastStore.getState().toasts[0]
    expect(toast?.title).toBe('Suppression impossible')
    expect(toast?.message).toBe(
      'Suppression impossible : encore utilisé par 3 créneaux modèles.',
    )
  })

  it('retombe sur un libelle generique quand le serveur n explique rien', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reponse(500, {}))

    const { result } = renderHook(() => useLocationMutations(), { wrapper })
    act(() => {
      result.current.deleteForeverLocation.mutate('l1')
    })

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1))
    expect(useToastStore.getState().toasts[0]?.message).toBe(
      'Une erreur interne est survenue. Réessayez plus tard.',
    )
  })

  it('annonce le succes quand le serveur accepte', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    )

    const { result } = renderHook(() => useLocationMutations(), { wrapper })
    act(() => {
      result.current.deleteForeverLocation.mutate('l1')
    })

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1))
    expect(useToastStore.getState().toasts[0]?.title).toBe(
      'Salle supprimée définitivement',
    )
  })
})
