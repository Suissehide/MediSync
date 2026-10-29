import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SlotApi } from '@/api/slot.api.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { Slot } from '@/types/slot.ts'
import { useSlotMutations } from './useSlot.ts'

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const salle = { type: 'salle' as const, slotIDs: ['a', 'b'], locationID: 'l1' }

describe('archiveSlots', () => {
  beforeEach(() => {
    useAuthStore.setState({
      context: {
        establishmentId: 'e1',
        serviceId: 's1',
        establishmentRole: 'ADMIN',
        serviceRole: 'COORDINATEUR',
        soignantId: null,
      },
    })
    useToastStore.setState({ toasts: [] })
    // Les deux créneaux restaurés se disputent la même salle.
    vi.spyOn(SlotApi, 'update').mockImplementation(({ id }) =>
      Promise.resolve({ id, conflicts: [salle] } as unknown as Slot),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('signale le conflit que la restauration fait revenir', async () => {
    const { result } = renderHook(() => useSlotMutations(), { wrapper })

    act(() =>
      result.current.archiveSlots.mutate({ ids: ['a', 'b'], archived: false }),
    )

    await waitFor(() =>
      expect(useToastStore.getState().toasts[0]?.title).toBe(
        'Enregistré, mais 1 conflit',
      ),
    )
  })

  it('ne signale rien en archivant, un creneau archive ne dispute rien', async () => {
    const { result } = renderHook(() => useSlotMutations(), { wrapper })

    act(() =>
      result.current.archiveSlots.mutate({ ids: ['a', 'b'], archived: true }),
    )

    await waitFor(() =>
      expect(result.current.archiveSlots.isSuccess).toBe(true),
    )
    expect(useToastStore.getState().toasts).toEqual([])
  })
})
