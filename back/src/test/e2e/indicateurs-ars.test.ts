import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

describe('indicateurs ARS', () => {
  let t: TestApp
  let establishmentId: string
  let serviceA: string
  let serviceB: string
  let cookies: { access_token: string }

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    const est = await createEstablishment()
    establishmentId = est.id
    serviceA = (await createService(est.id, 'Service A')).id
    serviceB = (await createService(est.id, 'Service B')).id
    await createUser({
      email: 'coordo@test.fr',
      memberships: [
        {
          establishmentId,
          services: [
            { serviceId: serviceA, role: 'COORDINATEUR' },
            { serviceId: serviceB, role: 'COORDINATEUR' },
          ],
        },
      ],
    })
    cookies = await signIn(t.app, 'coordo@test.fr')
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  const lire = async (serviceId: string) =>
    t.app.inject({
      method: 'GET',
      url: tenantUrl(
        establishmentId,
        serviceId,
        '/indicateurs-ars?from=2026-01-01&to=2026-12-31',
      ),
      cookies,
    })

  // Review Focus 5 : un dossier du service B ne compte jamais dans les chiffres du service A.
  it('ne compte que les dossiers du service courant', async () => {
    const patient = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Alex',
        lastName: 'Martin',
        createDate: new Date(),
      },
    })
    await testDb.patientServiceFile.create({
      data: {
        establishmentId,
        serviceId: serviceB,
        patientId: patient.id,
        entryDate: new Date('2026-03-01'),
      },
    })

    const vide = await lire(serviceA)
    const plein = await lire(serviceB)

    expect(vide.statusCode).toBe(200)
    const indicateurA = vide.json().indicators.find(
      (i: { code: string }) => i.code === '1.1',
    )
    const indicateurB = plein.json().indicators.find(
      (i: { code: string }) => i.code === '1.1',
    )
    expect(indicateurA.value).toBe(0)
    expect(indicateurB.value).toBe(1)
  })

  it('rend les 30 indicateurs', async () => {
    const res = await lire(serviceA)
    expect(res.statusCode).toBe(200)
    expect(res.json().indicators).toHaveLength(30)
  })

  // Review Focus 3 : une période à l'envers est refusée, pas rendue vide en silence.
  it('refuse une periode dont la fin precede le debut', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: tenantUrl(
        establishmentId,
        serviceA,
        '/indicateurs-ars?from=2026-12-31&to=2026-01-01',
      ),
      cookies,
    })
    expect(res.statusCode).toBe(400)
  })

  it('rend un classeur nomme par le service et la periode', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: tenantUrl(
        establishmentId,
        serviceA,
        '/indicateurs-ars/export?from=2026-01-01&to=2026-12-31',
      ),
      cookies,
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('spreadsheetml')
    expect(res.rawPayload.length).toBeGreaterThan(0)
    expect(res.headers['content-disposition']).toContain(
      'indicateurs-ars_2026-01-01_2026-12-31.xlsx',
    )
  })
})
