import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { PatientAccessLogEntry } from '@/types/accessLog.ts'

import { AccessLogApi } from './accessLog.api.ts'

const context = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'MEMBER' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: 'so1',
}

const entries: PatientAccessLogEntry[] = [
  {
    id: 'log1',
    action: 'dossier.ouvert',
    createdAt: '2026-01-15T10:30:00.000Z',
    serviceId: 's1',
    userFirstName: 'Alice',
    userLastName: 'Martin',
  },
]

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  url: 'http://localhost/e/e1/s/s1/patient/p1/acces',
  json: async () => body,
})

describe('AccessLogApi', () => {
  beforeEach(() => {
    useAuthStore.setState({ context })
    vi.unstubAllGlobals()
  })

  // Convention du dépôt (`front/CLAUDE.md` § « Le contexte est implicite ») : l'URL vient de
  // `tenantApiUrl()`, jamais d'un argument. Cette fonction ne prend que `patientID` — l'identifiant
  // de la ressource consultée, pas un identifiant de tenant.
  it('getByPatient compose l URL par tenantApiUrl(), en GET, sans argument de tenant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(entries))
    vi.stubGlobal('fetch', fetchMock)

    const result = await AccessLogApi.getByPatient('p1')

    expect(result).toEqual(entries)
    const [requestedUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestedUrl).toMatch(/\/e\/e1\/s\/s1\/patient\/p1\/acces$/)
    expect(init.method).toBe('GET')
  })

  it('propage une erreur HTTP plutot que de la masquer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      url: 'http://localhost/e/e1/s/s1/patient/p1/acces',
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(AccessLogApi.getByPatient('p1')).rejects.toThrow()
  })
})
