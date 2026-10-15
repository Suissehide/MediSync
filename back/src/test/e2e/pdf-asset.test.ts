import type { FastifyInstance } from 'fastify'

import { buildTestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { tenantUrl, twoServicesScenario } from './setup/fixtures'

// Un PNG 1x1 valide, le plus petit qui existe : ce sont les OCTETS qui font foi, pas le nom
// ni le `mimeType` du corps, que le client declare.
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('routes des images de PDF', () => {
  let app: FastifyInstance
  let close: () => Promise<void>
  let scenario: Awaited<ReturnType<typeof twoServicesScenario>>

  beforeAll(async () => {
    await truncateAll()
    const built = await buildTestApp()
    app = built.app
    close = built.close
    scenario = await twoServicesScenario(app)
  })

  afterAll(async () => {
    await close()
    await testDb.$disconnect()
  })

  const deposer = (corps: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: tenantUrl(scenario.est.id, scenario.serviceA.id, '/pdf-assets'),
      cookies: scenario.cookiesA,
      payload: corps,
    })

  const lire = (id: string) =>
    app.inject({
      method: 'GET',
      url: tenantUrl(
        scenario.est.id,
        scenario.serviceA.id,
        `/pdf-assets/${id}`,
      ),
      cookies: scenario.cookiesA,
    })

  it('depose une image et la rend par son identifiant', async () => {
    const depot = await deposer({
      fileName: 'logo.png',
      mimeType: 'image/png',
      base64: PNG_1x1,
    })

    expect(depot.statusCode).toBe(201)
    expect(depot.json()).toMatchObject({
      fileName: 'logo.png',
      mimeType: 'image/png',
    })
    // Le depot ne rend PAS les octets : le front les demande ensuite, et react-query les
    // garde en cache par identifiant.
    expect(depot.json().base64).toBeUndefined()

    const relecture = await lire(depot.json().id)
    expect(relecture.statusCode).toBe(200)
    expect(relecture.json()).toEqual({
      mimeType: 'image/png',
      base64: PNG_1x1,
    })
  })

  it('liste les images du service sans leurs octets', async () => {
    const res = await app.inject({
      method: 'GET',
      url: tenantUrl(scenario.est.id, scenario.serviceA.id, '/pdf-assets'),
      cookies: scenario.cookiesA,
    })

    expect(res.statusCode).toBe(200)
    const liste = res.json() as Record<string, unknown>[]
    expect(liste.length).toBeGreaterThan(0)
    expect(liste[0]).toMatchObject({ fileName: 'logo.png' })
    // Une liste qui porterait les octets ferait transiter toute la bibliotheque a chaque
    // ouverture de l'inspecteur.
    expect(liste[0]?.base64).toBeUndefined()
    expect(liste[0]?.bytes).toBeUndefined()
  })

  it('rend 404 sur un identifiant inconnu', async () => {
    const res = await lire('clv00000000000000000000z')
    expect(res.statusCode).toBe(404)
  })

  // Le `mimeType` est DECLARE par le client : il ne prouve rien. Ce qui fait foi, ce sont les
  // premiers octets du fichier.
  it('refuse un type qui n est pas une image', async () => {
    const res = await deposer({
      fileName: 'piege.pdf',
      mimeType: 'application/pdf',
      base64: PNG_1x1,
    })
    expect(res.statusCode).toBe(400)
  })

  it('refuse des octets qui ne sont pas ceux du type annonce', async () => {
    const res = await deposer({
      fileName: 'menteur.png',
      mimeType: 'image/png',
      // Un PDF renomme : « %PDF-1.4 » en base64.
      base64: Buffer.from('%PDF-1.4 faux document').toString('base64'),
    })
    expect(res.statusCode).toBe(400)
    // Le message nomme le type attendu comme un humain l'ecrit, pas « une image image/png ».
    expect(JSON.stringify(res.json())).toContain('PNG')
  })

  it('refuse un base64 qui n est pas du base64', async () => {
    const res = await deposer({
      fileName: 'casse.png',
      mimeType: 'image/png',
      base64: 'ceci n est pas du base64 !!',
    })
    expect(res.statusCode).toBe(400)
  })

  it('refuse un base64 vide', async () => {
    const res = await deposer({
      fileName: 'vide.png',
      mimeType: 'image/png',
      base64: '',
    })
    expect(res.statusCode).toBe(400)
  })

  // 2 Mo d'image, soit la borne du schema, exprimee en caracteres de base64.
  const BORNE_BASE64 = Math.ceil((2 * 1024 * 1024 * 4) / 3)

  // Le refus doit venir de l'APPLICATION et nommer la limite : sans `bodyLimit` releve sur la
  // route, Fastify repondrait 413 des 1 Mo, sans dire laquelle des deux limites a saute.
  it('refuse une image a peine trop grosse, avec un message qui nomme la limite', async () => {
    const res = await deposer({
      fileName: 'un-peu-trop.png',
      mimeType: 'image/png',
      base64: 'A'.repeat(BORNE_BASE64 + 1000),
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.stringify(res.json())).toMatch(/2\s?Mo/)
  })

  const supprimer = (id: string) =>
    app.inject({
      method: 'DELETE',
      url: tenantUrl(
        scenario.est.id,
        scenario.serviceA.id,
        `/pdf-assets/${id}`,
      ),
      cookies: scenario.cookiesA,
    })

  it('supprime une image que personne n utilise', async () => {
    const depot = await deposer({
      fileName: 'jetable.png',
      mimeType: 'image/png',
      base64: PNG_1x1,
    })
    const id = depot.json().id

    const res = await supprimer(id)

    expect(res.statusCode).toBe(204)
    expect((await lire(id)).statusCode).toBe(404)
  })

  // Sinon un design perd son fond sans que personne ne l'ait demande, et il faudrait le
  // rouvrir pour s'en apercevoir.
  it('refuse de supprimer une image qu un design utilise, et nomme le design', async () => {
    const depot = await deposer({
      fileName: 'utilisee.png',
      mimeType: 'image/png',
      base64: PNG_1x1,
    })
    const assetId = depot.json().id
    await testDb.pdfDesign.create({
      data: {
        name: 'Programme avec fond',
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceA.id,
        content: {
          version: 1,
          pages: [
            {
              kind: 'canvas',
              id: 'p1',
              background: '#ffffff',
              elements: [
                {
                  id: 'fond',
                  kind: 'image',
                  x: 0,
                  y: 0,
                  w: 100,
                  h: 100,
                  rotation: 0,
                  source: { assetId },
                  fit: 'cover',
                },
              ],
            },
          ],
        },
      },
    })

    const res = await supprimer(assetId)

    expect(res.statusCode).toBe(409)
    expect(JSON.stringify(res.json())).toContain('Programme avec fond')
    // Et l'image est toujours la.
    expect((await lire(assetId)).statusCode).toBe(200)
  })

  it('refuse de supprimer une image inconnue', async () => {
    const res = await supprimer('clv00000000000000000000z')
    expect(res.statusCode).toBe(404)
  })

  // LA LIMITE DE CE DISPOSITIF, nommee plutot que sous-entendue : au-dela de `bodyLimit`,
  // Fastify refuse le corps AVANT le schema, donc sans le message. Un fichier vraiment enorme
  // recoit un 413 nu, et c'est le front qui doit l'eviter en refusant d'envoyer.
  it('refuse une image enorme par la limite de corps, sans message', async () => {
    const res = await deposer({
      fileName: 'enorme.png',
      mimeType: 'image/png',
      base64: 'A'.repeat(8 * 1024 * 1024),
    })

    expect(res.statusCode).toBe(413)
    expect(JSON.stringify(res.json())).not.toMatch(/2\s?Mo/)
  })
})
