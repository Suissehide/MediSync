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

// Suite de `thematique-archivage.test.ts` : les salles, les soignants et les
// modeles de diagnostic educatif portaient le meme piege. Le soignant etait le
// pire des trois — ses liens vers creneaux modeles et thematiques sont en
// `onDelete: Cascade`, donc la suppression effacait les lignes de liaison, pas
// seulement un pointeur.
describe('archivage des salles, soignants et modeles de diagnostic', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let cookies: Cookies

  const url = (path: string) => tenantUrl(establishmentId, serviceId, path)
  const get = (path: string) =>
    testApp.app.inject({ method: 'GET', url: url(path), cookies })
  const archive = (path: string) =>
    testApp.app.inject({ method: 'DELETE', url: url(path), cookies })
  const restore = (path: string) =>
    testApp.app.inject({
      method: 'PATCH',
      url: url(path),
      cookies,
      payload: { archived: false } as never,
    })
  const noms = (res: { json: () => unknown }) =>
    (res.json() as { name: string }[]).map((x) => x.name)

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-REF')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-REF')
    serviceId = service.id

    await createUser({
      email: 'coordinateur@referentiels.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })

    testApp = await buildTestApp()
    cookies = await signIn(testApp.app, 'coordinateur@referentiels.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  const creerCreneauModele = async (data: Record<string, unknown>) =>
    testDb.slotTemplate.create({
      data: {
        startTime: new Date('2026-04-01T09:00:00Z'),
        endTime: new Date('2026-04-01T10:00:00Z'),
        offsetDays: 0,
        isIndividual: true,
        color: '#fff',
        serviceId,
        establishmentId,
        ...data,
      },
    })

  it('archiver une salle laisse les creneaux modeles la porter', async () => {
    const salle = await testDb.location.create({
      data: { name: 'Salle Bleue', serviceId, establishmentId },
    })
    const modele = await creerCreneauModele({ locationID: salle.id })

    expect((await archive(`/location/${salle.id}`)).statusCode).toBe(204)

    const ligne = await testDb.location.findUnique({ where: { id: salle.id } })
    expect(ligne?.archivedAt).toBeInstanceOf(Date)
    expect(
      (await testDb.slotTemplate.findUnique({ where: { id: modele.id } }))
        ?.locationID,
    ).toBe(salle.id)

    expect(noms(await get('/location'))).not.toContain('Salle Bleue')
    expect(noms(await get('/location?archived=true'))).toContain('Salle Bleue')

    expect((await restore(`/location/${salle.id}`)).statusCode).toBe(200)
    expect(noms(await get('/location'))).toContain('Salle Bleue')
  })

  // Le cas le plus grave : ici un DELETE ne vidait pas un pointeur, il
  // supprimait les lignes de SlotTemplateSoignant et SoignantThematic.
  it('archiver un soignant laisse ses liens creneaux et thematiques intacts', async () => {
    const soignant = await testDb.soignant.create({
      data: { name: 'Diététicienne', serviceId, establishmentId },
    })
    const modele = await creerCreneauModele({})
    await testDb.slotTemplateSoignant.create({
      data: {
        slotTemplateId: modele.id,
        soignantId: soignant.id,
        serviceId,
        establishmentId,
      },
    })
    const thematique = await testDb.thematic.create({
      data: { name: 'Équilibre alimentaire', serviceId, establishmentId },
    })
    await testDb.soignantThematic.create({
      data: {
        soignantId: soignant.id,
        thematicId: thematique.id,
        serviceId,
        establishmentId,
      },
    })
    const tache = await testDb.todo.create({
      data: {
        createDate: new Date('2026-04-01T09:00:00Z'),
        title: 'Préparer la séance',
        completed: false,
        soignantID: soignant.id,
        serviceId,
        establishmentId,
      },
    })

    expect((await archive(`/soignant/${soignant.id}`)).statusCode).toBe(204)

    expect(
      await testDb.slotTemplateSoignant.count({
        where: { soignantId: soignant.id },
      }),
    ).toBe(1)
    expect(
      await testDb.soignantThematic.count({
        where: { soignantId: soignant.id },
      }),
    ).toBe(1)
    expect(
      (await testDb.todo.findUnique({ where: { id: tache.id } }))?.soignantID,
    ).toBe(soignant.id)

    expect(noms(await get('/soignant'))).not.toContain('Diététicienne')
    expect(noms(await get('/soignant?archived=true'))).toContain(
      'Diététicienne',
    )

    expect((await restore(`/soignant/${soignant.id}`)).statusCode).toBe(200)
    expect(noms(await get('/soignant'))).toContain('Diététicienne')
  })

  it('archiver un modele de diagnostic laisse les diagnostics remplis le porter', async () => {
    const modele = await testDb.diagnosticEducatifTemplate.create({
      data: {
        name: 'Bilan initial',
        activeFields: [],
        serviceId,
        establishmentId,
      },
    })
    const patient = await testDb.patient.create({
      data: {
        firstName: 'Jean',
        lastName: 'Diagnostic',
        createDate: new Date('2026-04-01T09:00:00Z'),
        establishmentId,
      },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId, establishmentId },
    })
    const diagnostic = await testDb.diagnosticEducatif.create({
      data: {
        patientId: patient.id,
        templateId: modele.id,
        activeFields: [],
        serviceId,
        establishmentId,
      },
    })

    expect(
      (await archive(`/diagnostic-template/${modele.id}`)).statusCode,
    ).toBe(204)

    expect(
      (
        await testDb.diagnosticEducatif.findUnique({
          where: { id: diagnostic.id },
        })
      )?.templateId,
    ).toBe(modele.id)

    expect(noms(await get('/diagnostic-template'))).not.toContain(
      'Bilan initial',
    )
    expect(noms(await get('/diagnostic-template?archived=true'))).toContain(
      'Bilan initial',
    )

    expect(
      (await restore(`/diagnostic-template/${modele.id}`)).statusCode,
    ).toBe(200)
    expect(noms(await get('/diagnostic-template'))).toContain('Bilan initial')
  })
})
