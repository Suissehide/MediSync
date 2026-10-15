import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { PdfDesignPresetApi } from './pdfDesignPreset.api.ts'

const okResponse = (body: unknown, status = 200) => ({
  ok: true,
  status,
  url: 'http://localhost/super-admin/pdf-design-presets',
  json: async () => body,
})

describe('PdfDesignPresetApi', () => {
  beforeEach(() => {
    // AUCUN CONTEXTE DE TENANT : le super-admin est hors de tout etablissement et de tout
    // service. Si un de ces appels passait par `tenantApiUrl()`, il leverait ici — et c'est
    // precisement ce que ce harnais sans contexte est la pour attraper.
    useAuthStore.setState({ context: null })
    vi.unstubAllGlobals()
  })

  it('liste les modeles livres sans contexte de tenant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await PdfDesignPresetApi.getAll()

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/super-admin\/pdf-design-presets\?archived=false$/)
  })

  it('demande les modeles supprimes par ?archived=true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await PdfDesignPresetApi.getAll(true)

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\?archived=true$/)
  })

  it('cree un modele vierge par un POST au corps vide', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ id: 'p1' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    await PdfDesignPresetApi.create({})

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({})
  })

  it('duplique en ne portant que la source', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ id: 'p2' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    await PdfDesignPresetApi.create({ sourcePresetId: 'p1' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ sourcePresetId: 'p1' })
  })

  it('met a jour par PATCH, l identifiant dans le chemin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ id: 'p1' }))
    vi.stubGlobal('fetch', fetchMock)

    await PdfDesignPresetApi.update({ id: 'p1', name: 'Nouveau nom' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/pdf-design-presets\/p1$/)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Nouveau nom' })
  })

  it('supprime par DELETE', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 204,
        url: '',
        json: async () => null,
      })
    vi.stubGlobal('fetch', fetchMock)

    await PdfDesignPresetApi.archive('p1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/pdf-design-presets\/p1$/)
    expect(init.method).toBe('DELETE')
  })

  // La liste ENTIERE, dans le nouvel ordre : le back refuse tout ce qui ne decrit pas
  // exactement l'ensemble existant, et il a raison — un delta le laisserait deviner.
  it('reordonne en envoyant la liste entiere', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 204,
        url: '',
        json: async () => null,
      })
    vi.stubGlobal('fetch', fetchMock)

    await PdfDesignPresetApi.reorder(['b', 'a'])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/pdf-design-presets\/reorder$/)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['b', 'a'] })
  })

  // La lecon de l'etape 4 : sans ce passage, le refus du back s'affiche « le serveur n'a pas
  // pu traiter la requete », qui ne dit pas CE QUI ne va pas dans la liste envoyee.
  it('remonte le message du serveur quand le reordonnancement est refuse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        url: 'http://localhost/super-admin/pdf-design-presets/reorder',
        clone() {
          return this
        },
        json: async () => ({
          message: 'La liste ne correspond pas exactement aux modèles livrés.',
        }),
      }),
    )

    await expect(PdfDesignPresetApi.reorder(['a'])).rejects.toThrow(
      /ne correspond pas exactement/,
    )
  })
})
