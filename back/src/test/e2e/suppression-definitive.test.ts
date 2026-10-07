import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

type Cookies = { access_token: string }

// « Vider la corbeille » : complement de l'archivage. Il ne doit jamais pouvoir
// rejouer l'incident du 2026-10-07, donc il est refuse tant que quelque chose
// reference la ligne — et la base le refuse aussi, par `onDelete: Restrict`.
describe('suppression definitive d un referentiel archive', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let cookies: Cookies

  const url = (path: string) => tenantUrl(establishmentId, serviceId, path)
  const archiver = (path: string) =>
    testApp.app.inject({ method: 'DELETE', url: url(path), cookies })
  const supprimer = (path: string) =>
    testApp.app.inject({
      method: 'DELETE',
      url: url(`${path}/definitive`),
      cookies,
    })

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-SUPPR')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-SUPPR')
    serviceId = service.id

    await createUser({
      email: 'coordinateur@suppression.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })

    testApp = await buildTestApp()
    cookies = await signIn(testApp.app, 'coordinateur@suppression.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  const creerSalleAvecCreneaux = async (name: string, combien: number) => {
    const salle = await testDb.location.create({
      data: { name, serviceId, establishmentId },
    })
    for (let i = 0; i < combien; i++) {
      await testDb.slotTemplate.create({
        data: {
          startTime: new Date('2026-04-01T09:00:00Z'),
          endTime: new Date('2026-04-01T10:00:00Z'),
          offsetDays: 0,
          isIndividual: true,
          color: '#fff',
          locationID: salle.id,
          serviceId,
          establishmentId,
        },
      })
    }
    return salle
  }

  it('supprime pour de bon une ligne archivee que personne n utilise', async () => {
    const salle = await creerSalleAvecCreneaux('Salle jamais servie', 0)
    expect((await archiver(`/location/${salle.id}`)).statusCode).toBe(204)

    expect((await supprimer(`/location/${salle.id}`)).statusCode).toBe(204)
    expect(
      await testDb.location.findUnique({ where: { id: salle.id } }),
    ).toBeNull()
  })

  it('refuse en 409 tant que la ligne est utilisee, et nomme ce qui bloque', async () => {
    const salle = await creerSalleAvecCreneaux('Salle très utilisée', 3)
    expect((await archiver(`/location/${salle.id}`)).statusCode).toBe(204)

    const refus = await supprimer(`/location/${salle.id}`)
    expect(refus.statusCode).toBe(409)
    expect((refus.json() as { message: string }).message).toContain(
      '3 créneaux modèles',
    )

    // Rien n'a bouge : ni la salle, ni les creneaux.
    expect(
      await testDb.location.findUnique({ where: { id: salle.id } }),
    ).not.toBeNull()
    expect(
      await testDb.slotTemplate.count({ where: { locationID: salle.id } }),
    ).toBe(3)
  })

  it('refuse de supprimer une ligne qui n est PAS archivee', async () => {
    const salle = await creerSalleAvecCreneaux('Salle active', 0)

    expect((await supprimer(`/location/${salle.id}`)).statusCode).toBe(404)
    expect(
      await testDb.location.findUnique({ where: { id: salle.id } }),
    ).not.toBeNull()
  })

  // Le comptage applicatif donne le message ; c'est la base qui garantit. Si
  // les deux divergeaient un jour, c'est ce refus-la qui protege les donnees.
  it('la base refuse elle-meme la suppression, comptage applicatif contourne', async () => {
    const salle = await creerSalleAvecCreneaux('Salle gardée par Postgres', 2)
    await expect(
      testDb.location.delete({ where: { id: salle.id } }),
    ).rejects.toThrow()
    expect(
      await testDb.slotTemplate.count({ where: { locationID: salle.id } }),
    ).toBe(2)
  })

  it('un soignant encore au planning ne se supprime pas', async () => {
    const soignant = await testDb.soignant.create({
      data: { name: 'Ergothérapeute', serviceId, establishmentId },
    })
    const modele = await testDb.slotTemplate.create({
      data: {
        startTime: new Date('2026-04-01T09:00:00Z'),
        endTime: new Date('2026-04-01T10:00:00Z'),
        offsetDays: 0,
        isIndividual: true,
        color: '#fff',
        serviceId,
        establishmentId,
      },
    })
    await testDb.slotTemplateSoignant.create({
      data: {
        slotTemplateId: modele.id,
        soignantId: soignant.id,
        serviceId,
        establishmentId,
      },
    })
    expect((await archiver(`/soignant/${soignant.id}`)).statusCode).toBe(204)

    const refus = await supprimer(`/soignant/${soignant.id}`)
    expect(refus.statusCode).toBe(409)
    expect((refus.json() as { message: string }).message).toContain(
      '1 créneau modèle',
    )
    expect(
      await testDb.slotTemplateSoignant.count({
        where: { soignantId: soignant.id },
      }),
    ).toBe(1)
  })
})
