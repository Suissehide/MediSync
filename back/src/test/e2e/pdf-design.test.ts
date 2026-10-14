import type { FastifyInstance } from 'fastify'

import { buildTestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { tenantUrl, twoServicesScenario } from './setup/fixtures'

const CONTENT = {
  version: 1,
  pages: [{ kind: 'canvas', id: 'p1', background: '#ffffff', elements: [] }],
}

// Cloisonnement : a cette etape la seule route est la LISTE, il n'existe pas de lecture par
// id. La preuve prend donc la forme de la route — un design du service B n'apparait pas dans
// la liste du service A — plutot que le 404 par id du tableau d'isolation.test.ts, qui n'aura
// de cas a recevoir qu'avec les routes d'ecriture.
describe('GET /pdf-designs', () => {
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

  const lire = (serviceId: string, cookies: { access_token: string }) =>
    app.inject({
      method: 'GET',
      url: tenantUrl(scenario.est.id, serviceId, '/pdf-designs'),
      cookies,
    })

  it('rend les presets globaux a un membre du service', async () => {
    const preset = await testDb.pdfDesignPreset.create({
      data: { name: 'Programme de reference', content: CONTENT, sortOrder: 0 },
    })

    const res = await lire(scenario.serviceA.id, scenario.cookiesA)

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.presets).toHaveLength(1)
    expect(body.presets[0]).toMatchObject({
      id: preset.id,
      name: 'Programme de reference',
      // Un preset n'est jamais le design par defaut : seul un design de service l'est.
      isDefault: false,
    })
    expect(body.designs).toHaveLength(0)
  })

  it('rend les designs du service courant, et pas ceux d un autre service', async () => {
    await testDb.pdfDesign.create({
      data: {
        name: 'Design de A',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceA.id,
      },
    })
    await testDb.pdfDesign.create({
      data: {
        name: 'Design de B',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceB.id,
      },
    })

    const vuDeA = await lire(scenario.serviceA.id, scenario.cookiesA)
    const vuDeB = await lire(scenario.serviceB.id, scenario.cookiesB)

    // Le contrepoint depuis B distingue un vrai cloisonnement d'une preparation ratee :
    // si la creation avait echoue, le proprietaire ne verrait rien non plus.
    expect(vuDeA.json().designs.map((d: { name: string }) => d.name)).toEqual([
      'Design de A',
    ])
    expect(vuDeB.json().designs.map((d: { name: string }) => d.name)).toEqual([
      'Design de B',
    ])
  })

  it('ne rend pas les designs supprimes', async () => {
    await testDb.pdfDesign.create({
      data: {
        name: 'Design archive',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceB.id,
        archivedAt: new Date(),
      },
    })

    const res = await lire(scenario.serviceB.id, scenario.cookiesB)

    expect(res.json().designs.map((d: { name: string }) => d.name)).toEqual([
      'Design de B',
    ])
  })

  // Un contenu invalide en base — un preset retouche a la main, une version future du schema —
  // ne doit faire tomber QUE sa ligne. Les presets etant GLOBAUX, le faire remonter en erreur
  // de reponse eteindrait l'export PDF de tous les services a la fois.
  it('ecarte un design au contenu invalide sans faire tomber la liste', async () => {
    await testDb.pdfDesignPreset.create({
      data: {
        name: 'Preset casse',
        content: {
          version: 1,
          pages: [
            {
              kind: 'canvas',
              id: 'p1',
              elements: [{ id: 'e1', kind: 'qrcode', x: 0, y: 0, w: 1, h: 1 }],
            },
          ],
        },
        sortOrder: 9,
      },
    })

    const res = await lire(scenario.serviceA.id, scenario.cookiesA)

    expect(res.statusCode).toBe(200)
    const noms = res.json().presets.map((p: { name: string }) => p.name)
    expect(noms).toContain('Programme de reference')
    expect(noms).not.toContain('Preset casse')
  })

  it('refuse a un membre du service A de lire sous le service B', async () => {
    const res = await lire(scenario.serviceB.id, scenario.cookiesA)

    // 404, jamais 403 : l'existence du service B ne doit pas fuir. Un 500 serait une alarme,
    // pas une variante acceptable.
    expect(res.statusCode).toBe(404)
  })
})
