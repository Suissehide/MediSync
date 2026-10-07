import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ThematicApi } from '@/api/thematic.api.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { TenantContext } from '@/types/auth.ts'
import { useThematicMutations } from './useThematic.tsx'

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

// Le toast d'archivage ne vit que quelques secondes : son bouton « Annuler »
// est la seule marche arriere immediate, et rien ne le rendait visible depuis
// l'ecran (le toast est rendu dans un autre arbre React).
describe('annulation immediate d un archivage', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: service })
    useToastStore.setState({ toasts: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('le bouton « Annuler » du toast restaure la thematique archivee', async () => {
    vi.spyOn(ThematicApi, 'archive').mockResolvedValue(undefined)
    const update = vi.spyOn(ThematicApi, 'update').mockResolvedValue({
      id: 't1',
      name: 'Mes facteurs de risque',
      soignants: [],
    })

    const { result } = renderHook(() => useThematicMutations(), { wrapper })

    act(() => {
      result.current.archiveThematic.mutate('t1')
    })
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1))

    const toast = useToastStore.getState().toasts[0]
    expect(toast?.title).toBe('Thématique archivée')

    // Le toast porte un element React : on le rend pour cliquer dessus, comme
    // le Toaster le ferait.
    const { getByRole } = render(toast?.action ?? null, { wrapper })
    act(() => {
      getByRole('button', { name: 'Annuler' }).click()
    })

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ id: 't1', archived: false }),
    )
  })
})
