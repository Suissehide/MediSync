import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useSlotConflictsQuery } from './useSlot.ts'

const wrapper = () => {
  const queryClient = new QueryClient()
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useSlotConflictsQuery', () => {
  // Les écrans en font une dépendance d'effet : une nouvelle liste vide à chaque rendu boucle à l'infini.
  it('renvoie la meme liste vide d un rendu a l autre tant que la plage est inconnue', () => {
    const { result, rerender } = renderHook(
      () => useSlotConflictsQuery(null, 0),
      { wrapper: wrapper() },
    )
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  // La requête repartirait dès l'arrivée des créneaux : le premier appel serait perdu.
  it('attend les creneaux avant d interroger les conflits', async () => {
    useAuthStore.setState({
      context: {
        establishmentId: 'e1',
        serviceId: 's1',
        establishmentRole: 'ADMIN',
        serviceRole: 'COORDINATEUR',
        soignantId: null,
      },
    })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    renderHook(
      () => useSlotConflictsQuery({ from: '2026-10-19', to: '2026-10-24' }, 0),
      { wrapper: wrapper() },
    )
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
