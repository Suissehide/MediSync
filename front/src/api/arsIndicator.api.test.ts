import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { ArsIndicatorApi } from './arsIndicator.api.ts'

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
  url: 'http://localhost/e/e1/s/s1/indicateurs-ars/saisies/2026/2.5',
  json: async () => body,
})

describe('ArsIndicatorApi.saveAnswer', () => {
  beforeEach(() => {
    useAuthStore.setState({ context })
    vi.unstubAllGlobals()
  })

  it('envoie un PUT sur /indicateurs-ars/saisies/:year/:code', async () => {
    const reponse = {
      numberValue: 3,
      textValue: 'ambulatoire',
      boolValue: null,
    }
    const fetchMock = vi.fn().mockResolvedValue(okResponse(reponse))
    vi.stubGlobal('fetch', fetchMock)

    const result = await ArsIndicatorApi.saveAnswer(2026, '2.5', {
      numberValue: 3,
      textValue: 'ambulatoire',
    })

    expect(result).toEqual(reponse)
    const [requestedUrl, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(requestedUrl).toMatch(
      /\/e\/e1\/s\/s1\/indicateurs-ars\/saisies\/2026\/2\.5$/,
    )
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      numberValue: 3,
      textValue: 'ambulatoire',
    })
  })

  it('accepte le corps oui/non de 4.2', async () => {
    const reponse = { numberValue: null, textValue: null, boolValue: true }
    const fetchMock = vi.fn().mockResolvedValue(okResponse(reponse))
    vi.stubGlobal('fetch', fetchMock)

    await ArsIndicatorApi.saveAnswer(2026, '4.2', { boolValue: true })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ boolValue: true })
  })
})
