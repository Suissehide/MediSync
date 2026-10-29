import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import {
  useIndicatorResultsQuery,
  useIndicatorSetsQuery,
  useSaveIndicatorAnswerMutation,
} from './useIndicatorSet.ts'

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
  url: 'http://localhost/e/e1/s/s1/indicator-sets',
  json: async () => body,
})

const wrapper = (queryClient = new QueryClient()) => {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  useAuthStore.setState({ context })
  vi.unstubAllGlobals()
})

describe('useIndicatorSetsQuery', () => {
  it('ne garde que les jeux actifs, dans leur ordre', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse([
          { id: 'b', name: 'Qualité', order: 2, archived: false },
          { id: 'x', name: 'Ancien', order: 0, archived: true },
          { id: 'a', name: 'Grille ARS', order: 1, archived: false },
        ]),
      ),
    )

    const { result } = renderHook(() => useIndicatorSetsQuery(), {
      wrapper: wrapper(),
    })

    await waitFor(() =>
      expect(result.current.sets?.map((s) => s.name)).toEqual([
        'Grille ARS',
        'Qualité',
      ]),
    )
  })

  it('n interroge pas le serveur quand il est desactive', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useIndicatorSetsQuery(false), { wrapper: wrapper() })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('useIndicatorResultsQuery', () => {
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
      () => useIndicatorResultsQuery('set1', '2026-01-01', '2026-12-31'),
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
      () => useIndicatorResultsQuery('set1', '2026-03-01', '2026-06-01'),
      { wrapper: wrapper() },
    )

    await waitFor(() => expect(result.current.indicators).toEqual([]))
    expect(result.current.manualYear).toBeNull()
  })
})

describe('useSaveIndicatorAnswerMutation', () => {
  it('enregistre la reponse et invalide les resultats du jeu', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okResponse({ numberValue: 4, textValue: 'texte', boolValue: null }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(
      () => useSaveIndicatorAnswerMutation('set1'),
      { wrapper: wrapper(queryClient) },
    )

    result.current.mutate({
      year: 2026,
      indicatorId: 'ind25',
      body: { numberValue: 4, textValue: 'texte' },
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/indicator-sets\/set1\/answers\/2026\/ind25$/,
    )
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['get_indicator_results', 'set1'],
    })
  })
})
