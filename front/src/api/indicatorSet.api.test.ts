import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { IndicatorSetApi } from './indicatorSet.api.ts'

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
  url: 'http://localhost/e/e1/s/s1/indicator-sets/set1/answers/2026/ind25',
  json: async () => body,
})

describe('IndicatorSetApi', () => {
  beforeEach(() => {
    useAuthStore.setState({ context })
    vi.unstubAllGlobals()
  })

  it('envoie un PUT sur /indicator-sets/:setId/answers/:year/:indicatorId', async () => {
    const reponse = {
      numberValue: 3,
      textValue: 'ambulatoire',
      boolValue: null,
    }
    const fetchMock = vi.fn().mockResolvedValue(okResponse(reponse))
    vi.stubGlobal('fetch', fetchMock)

    const result = await IndicatorSetApi.saveAnswer('set1', 2026, 'ind25', {
      numberValue: 3,
      textValue: 'ambulatoire',
    })

    expect(result).toEqual(reponse)
    const [requestedUrl, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(requestedUrl).toMatch(
      /\/e\/e1\/s\/s1\/indicator-sets\/set1\/answers\/2026\/ind25$/,
    )
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      numberValue: 3,
      textValue: 'ambulatoire',
    })
  })

  it('accepte le corps oui/non', async () => {
    const reponse = { numberValue: null, textValue: null, boolValue: true }
    const fetchMock = vi.fn().mockResolvedValue(okResponse(reponse))
    vi.stubGlobal('fetch', fetchMock)

    await IndicatorSetApi.saveAnswer('set1', 2026, 'ind42', {
      boolValue: true,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ boolValue: true })
  })

  it('lit les resultats et l export d un jeu sur la periode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ...okResponse({}),
      blob: async () => new Blob(),
    })
    vi.stubGlobal('fetch', fetchMock)

    await IndicatorSetApi.results('set1', '2026-01-01', '2026-12-31')
    await IndicatorSetApi.exportExcel('set1', '2026-01-01', '2026-12-31')

    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual([
      expect.stringMatching(
        /\/e\/e1\/s\/s1\/indicator-sets\/set1\/results\?from=2026-01-01&to=2026-12-31$/,
      ),
      expect.stringMatching(
        /\/e\/e1\/s\/s1\/indicator-sets\/set1\/export\?from=2026-01-01&to=2026-12-31$/,
      ),
    ])
  })
})
