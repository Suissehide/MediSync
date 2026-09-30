import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { PatientAccessLogResponse } from '@/types/accessLog.ts'
import { AccessLogApi } from './accessLog.api.ts'

const context = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'MEMBER' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: 'so1',
}

// Enveloppe paginee depuis le 2026-10-01 : `data` + `total`/`page`/`pageSize`, comme les deux
// autres journaux du depot. Le `total` (12) est DELIBEREMENT different du nombre de lignes
// rendues (1) : c'est tout l'interet de ce champ, et une fixture ou les deux coincideraient ne
// distinguerait pas « le total » de « la longueur de la page ».
const response: PatientAccessLogResponse = {
  data: [
    {
      id: 'log1',
      action: 'dossier.ouvert',
      createdAt: '2026-01-15T10:30:00.000Z',
      serviceId: 's1',
      userFirstName: 'Alice',
      userLastName: 'Martin',
      accesParOctroi: false,
    },
  ],
  total: 12,
  page: 2,
  pageSize: 1,
}

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
    const fetchMock = vi.fn().mockResolvedValue(okResponse(response))
    vi.stubGlobal('fetch', fetchMock)

    const result = await AccessLogApi.getByPatient('p1')

    expect(result).toEqual(response)
    const [requestedUrl, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(requestedUrl).toMatch(/\/e\/e1\/s\/s1\/patient\/p1\/acces\?$/)
    expect(init.method).toBe('GET')
  })

  // Pagination (2026-10-01) : cette lecture n'avait aucune borne. Les deux parametres doivent
  // atteindre le SERVEUR — un filtrage ou un decoupage dans le navigateur ne pourrait, par
  // construction, que reduire une page deja recue (la lecon de la revue finale de l'etape 4b sur
  // le filtre « compte » de l'ecran plateforme).
  it('passe page et pageSize au serveur, en parametres de requete', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(response))
    vi.stubGlobal('fetch', fetchMock)

    await AccessLogApi.getByPatient('p1', { page: 3, pageSize: 25 })

    const [requestedUrl] = fetchMock.mock.calls[0] as [string]
    expect(requestedUrl).toContain('page=3')
    expect(requestedUrl).toContain('pageSize=25')
  })

  // Absents, ils ne sont pas envoyes du tout : c'est le back qui pose les defauts (1 et 50), une
  // seule fois, dans son schema Zod — jamais une seconde valeur par defaut recopiee ici, qui
  // pourrait deriver de l'autre.
  it('n envoie ni page ni pageSize quand l appelant n en donne pas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(response))
    vi.stubGlobal('fetch', fetchMock)

    await AccessLogApi.getByPatient('p1')

    const [requestedUrl] = fetchMock.mock.calls[0] as [string]
    expect(requestedUrl).not.toContain('page=')
    expect(requestedUrl).not.toContain('pageSize=')
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
