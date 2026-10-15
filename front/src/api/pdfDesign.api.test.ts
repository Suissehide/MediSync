import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { PdfDesignApi } from './pdfDesign.api.ts'

const context = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: null,
}

const okResponse = (body: unknown, status = 200) => ({
  ok: true,
  status,
  url: 'http://localhost/e/e1/s/s1/pdf-designs',
  json: async () => body,
})

const CONTENU = {
  version: 1 as const,
  pages: [{ kind: 'canvas' as const, id: 'p1', elements: [] }],
}

describe('PdfDesignApi', () => {
  beforeEach(() => {
    useAuthStore.setState({ context })
    vi.unstubAllGlobals()
  })

  // L'onglet « Supprimés » lit la meme route : le parametre voyage dans l'URL, pas dans le corps.
  it('demande les designs supprimes par ?archived=true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ presets: [], designs: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await PdfDesignApi.getAll(true)

    const [requestedUrl] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestedUrl).toMatch(/\/e\/e1\/s\/s1\/pdf-designs\?archived=true$/)
  })

  it('demande les designs actifs par defaut', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ presets: [], designs: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await PdfDesignApi.getAll()

    const [requestedUrl] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(requestedUrl).toMatch(/\/e\/e1\/s\/s1\/pdf-designs\?archived=false$/)
  })

  it('duplique un preset par un POST qui ne porte que sa source', async () => {
    const cree = {
      id: 'd1',
      name: 'Programme SMCV (copie)',
      content: CONTENU,
      isDefault: false,
    }
    const fetchMock = vi.fn().mockResolvedValue(okResponse(cree, 201))
    vi.stubGlobal('fetch', fetchMock)

    const result = await PdfDesignApi.create({ sourcePresetId: 'preset-smcv' })

    expect(result).toEqual(cree)
    const [requestedUrl, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(requestedUrl).toMatch(/\/e\/e1\/s\/s1\/pdf-designs$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      sourcePresetId: 'preset-smcv',
    })
  })

  // L'identifiant est dans le chemin, jamais dans le corps : le back n'en lirait pas un second.
  it('modifie un design par un PATCH dont le corps ne porte pas l id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        id: 'd1',
        name: 'Mon programme',
        content: CONTENU,
        isDefault: false,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await PdfDesignApi.update({ id: 'd1', name: 'Mon programme' })

    const [requestedUrl, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(requestedUrl).toMatch(/\/e\/e1\/s\/s1\/pdf-designs\/d1$/)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Mon programme' })
  })

  it('supprime un design par un DELETE', async () => {
    // 204 : rien a lire, `archive` ne rend rien.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      url: '',
      json: async () => null,
    })
    vi.stubGlobal('fetch', fetchMock)

    await PdfDesignApi.archive('d1')

    const [requestedUrl, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(requestedUrl).toMatch(/\/e\/e1\/s\/s1\/pdf-designs\/d1$/)
    expect(init.method).toBe('DELETE')
  })

  it('remonte une erreur lisible quand le serveur refuse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        url: 'http://localhost/e/e1/s/s1/pdf-designs',
        json: async () => ({ message: 'PdfDesignPreset not found' }),
      }),
    )

    await expect(
      PdfDesignApi.create({ sourcePresetId: 'inconnu' }),
    ).rejects.toThrow()
  })
})
