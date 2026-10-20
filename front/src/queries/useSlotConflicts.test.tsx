import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

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
})
