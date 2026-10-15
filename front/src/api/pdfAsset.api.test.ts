import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import {
  dataUri,
  lireEnBase64,
  PdfAssetApi,
  TAILLE_MAXIMALE_IMAGE,
} from './pdfAsset.api.ts'

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
  url: 'http://localhost/e/e1/s/s1/pdf-assets',
  json: async () => body,
})

describe('PdfAssetApi', () => {
  beforeEach(() => {
    useAuthStore.setState({ context })
    vi.unstubAllGlobals()
  })

  it('liste les images du service', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await PdfAssetApi.getAll()

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/e\/e1\/s\/s1\/pdf-assets$/)
  })

  it('depose une image en base64, sans multipart', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okResponse(
          { id: 'a1', fileName: 'logo.png', mimeType: 'image/png' },
          201,
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await PdfAssetApi.create({
      fileName: 'logo.png',
      mimeType: 'image/png',
      base64: 'AAAA',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/pdf-assets$/)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      fileName: 'logo.png',
      mimeType: 'image/png',
      base64: 'AAAA',
    })
  })

  it('lit les octets par identifiant', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ mimeType: 'image/png', base64: 'AAAA' }))
    vi.stubGlobal('fetch', fetchMock)

    const octets = await PdfAssetApi.getBytes('a1')

    expect(octets).toEqual({ mimeType: 'image/png', base64: 'AAAA' })
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/pdf-assets\/a1$/)
  })

  it('supprime une image', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      url: '',
      json: async () => null,
    })
    vi.stubGlobal('fetch', fetchMock)

    await PdfAssetApi.remove('a1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/pdf-assets\/a1$/)
    expect(init.method).toBe('DELETE')
  })

  // Le serveur refuse en 409 et NOMME les designs concernes : son message vaut mieux que
  // n'importe quelle phrase generique ecrite ici.
  it('remonte le refus du serveur quand un design utilise l image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        url: 'http://localhost/e/e1/s/s1/pdf-assets/a1',
        json: async () => ({
          message: 'Cette image est utilisée par : Programme cardio',
        }),
      }),
    )

    await expect(PdfAssetApi.remove('a1')).rejects.toThrow()
  })
})

// La data URI est ce que les DEUX moteurs recoivent : ni react-pdf ni `<img>` ne garantissent
// d'emporter le cookie sur une sous-ressource, et en developpement le front et le back ne sont
// meme pas sur le meme port.
describe('dataUri', () => {
  it('assemble le type et les octets', () => {
    expect(dataUri({ mimeType: 'image/png', base64: 'AAAA' })).toBe(
      'data:image/png;base64,AAAA',
    )
  })
})

describe('lireEnBase64', () => {
  it('retire l en-tete de la data URI que rend FileReader', async () => {
    const fichier = new File([new Uint8Array([0x89, 0x50])], 'x.png', {
      type: 'image/png',
    })

    const base64 = await lireEnBase64(fichier)

    expect(base64).not.toContain('data:')
    expect(base64).not.toContain(',')
    expect(base64.length).toBeGreaterThan(0)
  })

  // Au-dela de la limite de corps du back, Fastify refuse AVANT le schema : l'utilisateur
  // recevrait un 413 nu. Le seul moyen d'expliquer un fichier de 10 Mo est de ne pas
  // l'envoyer.
  it('refuse un fichier trop gros sans le lire, avec un message qui nomme la limite', async () => {
    const enorme = new File(
      [new Uint8Array(TAILLE_MAXIMALE_IMAGE + 1)],
      'g.png',
      {
        type: 'image/png',
      },
    )

    await expect(lireEnBase64(enorme)).rejects.toThrow(/2 Mo/)
  })

  it('accepte un fichier juste sous la limite', async () => {
    const limite = new File([new Uint8Array(TAILLE_MAXIMALE_IMAGE)], 'j.png', {
      type: 'image/png',
    })

    await expect(lireEnBase64(limite)).resolves.toBeTruthy()
  })
})
