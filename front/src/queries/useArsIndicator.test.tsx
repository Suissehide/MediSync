import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import {
  useArsIndicatorsQuery,
  useSaveArsAnswerMutation,
} from './useArsIndicator.ts'

const context = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: null,
}

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  url: 'http://localhost/e/e1/s/s1/indicateurs-ars',
  json: async () => body,
})

const wrapper = () => {
  const queryClient = new QueryClient()
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useArsIndicatorsQuery', () => {
  beforeEach(() => {
    useAuthStore.setState({ context })
    vi.unstubAllGlobals()
  })

  it('expose manualYear tel que renvoyé par le back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse({
          from: '2026-01-01',
          to: '2026-12-31',
          manualYear: 2026,
          indicators: [],
        }),
      ),
    )

    const { result } = renderHook(
      () => useArsIndicatorsQuery('2026-01-01', '2026-12-31'),
      { wrapper: wrapper() },
    )

    await waitFor(() => expect(result.current.manualYear).toBe(2026))
  })

  it('expose manualYear a null quand la periode n est pas une annee civile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse({
          from: '2026-03-01',
          to: '2026-06-01',
          manualYear: null,
          indicators: [],
        }),
      ),
    )

    const { result } = renderHook(
      () => useArsIndicatorsQuery('2026-03-01', '2026-06-01'),
      { wrapper: wrapper() },
    )

    await waitFor(() => expect(result.current.indicators).toEqual([]))
    expect(result.current.manualYear).toBeNull()
  })
})

describe('useSaveArsAnswerMutation', () => {
  beforeEach(() => {
    useAuthStore.setState({ context })
    vi.unstubAllGlobals()
  })

  it('appelle ArsIndicatorApi.saveAnswer et invalide les indicateurs ARS en cache', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okResponse({ numberValue: 4, textValue: 'texte', boolValue: null }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useSaveArsAnswerMutation(), {
      wrapper: Wrapper,
    })

    result.current.mutate({
      year: 2026,
      code: '2.5',
      body: { numberValue: 4, textValue: 'texte' },
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/indicateurs-ars\/saisies\/2026\/2\.5$/,
    )
    expect(invalidateSpy).toHaveBeenCalled()
  })
})
