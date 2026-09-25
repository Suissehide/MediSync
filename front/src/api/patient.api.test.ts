import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { PatientIdentityMatch } from '@/types/patient.ts'

import { PatientApi } from './patient.api.ts'

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
  url: 'http://localhost/e/e1/s/s1/patient/search',
  json: async () => body,
})

describe('PatientApi.searchIdentity', () => {
  beforeEach(() => {
    useAuthStore.setState({ context })
    vi.unstubAllGlobals()
  })

  // Convention du dépôt (`front/CLAUDE.md` § « Le contexte est implicite ») : l'URL vient de
  // `tenantApiUrl()`, jamais d'un argument establishment/service.
  it('compose l URL par tenantApiUrl(), en GET, avec les seuls paramètres fournis', async () => {
    const matches: PatientIdentityMatch[] = [
      { id: 'p1', firstName: 'Isabelle', lastName: 'Fontaine', birthDate: '1980-05-12T00:00:00.000Z' },
    ]
    const fetchMock = vi.fn().mockResolvedValue(okResponse(matches))
    vi.stubGlobal('fetch', fetchMock)

    const result = await PatientApi.searchIdentity({ firstName: 'Isabelle', lastName: 'Fontaine' })

    expect(result).toEqual(matches)
    const [requestedUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestedUrl).toMatch(/\/e\/e1\/s\/s1\/patient\/search\?/)
    expect(requestedUrl).toContain('firstName=Isabelle')
    expect(requestedUrl).toContain('lastName=Fontaine')
    expect(requestedUrl).not.toContain('birthDate')
    expect(init.method).toBe('GET')
  })

  it('n envoie que les champs renseignés (birthDate omis quand absent)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await PatientApi.searchIdentity({ lastName: 'Roche' })

    const [requestedUrl] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestedUrl).toContain('lastName=Roche')
    expect(requestedUrl).not.toContain('firstName')
  })
})
