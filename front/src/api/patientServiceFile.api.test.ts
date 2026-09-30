import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { PatientServiceFile } from '@/types/patientServiceFile.ts'
import { PatientServiceFileApi } from './patientServiceFile.api.ts'

const context = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: null,
}

const serviceFile: PatientServiceFile = {
  id: 'psf1',
  patientId: 'p1',
  serviceId: 's1',
  establishmentId: 'e1',
  createdAt: '2026-01-01T00:00:00.000Z',
  notes: 'une note',
}

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  url: 'http://localhost/e/e1/s/s1/patient/p1/service-file',
  json: async () => body,
})

describe('PatientServiceFileApi', () => {
  beforeEach(() => {
    useAuthStore.setState({ context })
    vi.unstubAllGlobals()
  })

  // Convention du dépôt (`front/CLAUDE.md` § « Le contexte est implicite ») : l'URL vient de
  // `tenantApiUrl()`, jamais d'un argument. Cette fonction ne prend que `patientID`.
  it('getByPatient compose l URL par tenantApiUrl(), en GET, sans argument de tenant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(serviceFile))
    vi.stubGlobal('fetch', fetchMock)

    const result = await PatientServiceFileApi.getByPatient('p1')

    expect(result).toEqual(serviceFile)
    const [requestedUrl, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(requestedUrl).toMatch(/\/e\/e1\/s\/s1\/patient\/p1\/service-file$/)
    expect(init.method).toBe('GET')
  })

  // PATCH, jamais PUT : voir le commentaire de la route back — un remplacement complet
  // effacerait les champs cliniques qu'un secrétariat n'a pas le droit de voir.
  it('update envoie un PATCH sur la même route, jamais un PUT', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(serviceFile))
    vi.stubGlobal('fetch', fetchMock)

    await PatientServiceFileApi.update({
      patientID: 'p1',
      notes: 'nouvelle note',
    })

    const [requestedUrl, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(requestedUrl).toMatch(/\/e\/e1\/s\/s1\/patient\/p1\/service-file$/)
    expect(init.method).toBe('PATCH')
  })

  // Rattachement d'une identité existante : POST sans corps sur la même route que
  // GET/PATCH — la route se distingue par la méthode, jamais par un chemin différent.
  it('attachExisting envoie un POST sur la même route, sans corps', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okResponse({ patientId: 'p1', alreadyFollowedHere: false }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await PatientServiceFileApi.attachExisting('p1')

    expect(result).toEqual({ patientId: 'p1', alreadyFollowedHere: false })
    const [requestedUrl, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(requestedUrl).toMatch(/\/e\/e1\/s\/s1\/patient\/p1\/service-file$/)
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
  })

  // Une charge partielle doit rester partielle : ni `patientID` (c'est un paramètre de route,
  // pas un champ du sous-dossier), ni un objet reconstruit à partir d'une lecture filtrée. Le
  // corps porte ici PLUSIEURS champs fournis : un seul n'aurait pas pu distinguer « n'envoie
  // que ce qu'on lui donne » de « n'envoie que le premier champ du corps » — un trou réel,
  // laissé vert par le seul champ envoyé jusqu'ici.
  it('update n envoie que les champs fournis dans le corps, jamais patientID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(serviceFile))
    vi.stubGlobal('fetch', fetchMock)

    await PatientServiceFileApi.update({
      patientID: 'p1',
      notes: 'nouvelle note',
      goal: 'objectif',
      careMode: 'ambulatoire',
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      notes: 'nouvelle note',
      goal: 'objectif',
      careMode: 'ambulatoire',
    })
    expect(body).not.toHaveProperty('patientID')
  })
})
