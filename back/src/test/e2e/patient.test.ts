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

// Filet avant l'etape 3 : elle va sortir seize colonnes de parcours et de
// contenu clinique de la table Patient vers un sous-dossier par service.
// Aucun test end-to-end ne couvrait encore les routes du patient. Ces tests
// sont ecrits sur le code actuel et doivent rester verts apres la migration,
// au prix d'un seul changement : le chemin ou ces colonnes se lisent.
describe('routes du patient', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let coordinateurCookies: Cookies

  const get = (url: string) =>
    testApp.app.inject({
      method: 'GET',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies: coordinateurCookies,
    })

  const post = (url: string, payload: unknown) =>
    testApp.app.inject({
      method: 'POST',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies: coordinateurCookies,
      payload: payload as never,
    })

  const patch = (url: string, payload: unknown) =>
    testApp.app.inject({
      method: 'PATCH',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies: coordinateurCookies,
      payload: payload as never,
    })

  const del = (url: string) =>
    testApp.app.inject({
      method: 'DELETE',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies: coordinateurCookies,
    })

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S')
    serviceId = service.id

    // COORDINATEUR : seul role qui detient a la fois patient:write,
    // patient:delete et clinical:write, necessaires aux quatre scenarios
    // couverts ici.
    await createUser({
      email: 'coordinateur@patient.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })

    testApp = await buildTestApp()
    coordinateurCookies = await signIn(testApp.app, 'coordinateur@patient.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('cree un patient, renseigne les seize colonnes de parcours et de contenu clinique une par une, et les relit a l identique', async () => {
    const created = await post('/patient', {
      firstName: 'Jean',
      lastName: 'Dupont',
    })
    expect(created.statusCode).toBe(201)
    const patientId = created.json().id as string

    const updateRes = await patch(`/patient/${patientId}`, {
      medicalDiagnosis: 'Diabete de type 2',
      entryDate: '2026-03-01T00:00:00.000Z',
      careMode: 'Ambulatoire',
      orientation: 'Medecin traitant',
      etpDecision: 'oui',
      programType: 'ETP diabete',
      nonInclusionDetails: 'Aucun motif de non-inclusion',
      customContentDetails: 'Contenu personnalise du parcours',
      goal: "Ameliorer l'equilibre alimentaire",
      exitDate: '2026-06-01T00:00:00.000Z',
      stopReason: 'Programme termine normalement',
      etpFinalOutcome: 'Objectifs atteints',
      referringCaregiver: 'Dr Martin',
      followUpToDo: 'Controle a 3 mois',
      notes: 'NOTE-PATIENT',
      details: 'DETAIL-PATIENT',
    })
    expect(updateRes.statusCode).toBe(200)

    const fetched = (await get(`/patient/${patientId}`)).json()

    // Les seize noms sont ecrits ici un par un : c'est le compte etabli
    // contre back/prisma/schema.prisma, et c'est precisement la liste que
    // l'etape 3 va deplacer hors de la table Patient.
    expect(fetched.medicalDiagnosis).toBe('Diabete de type 2')
    expect(new Date(fetched.entryDate).toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    )
    expect(fetched.careMode).toBe('Ambulatoire')
    expect(fetched.orientation).toBe('Medecin traitant')
    expect(fetched.etpDecision).toBe('oui')
    expect(fetched.programType).toBe('ETP diabete')
    expect(fetched.nonInclusionDetails).toBe('Aucun motif de non-inclusion')
    expect(fetched.customContentDetails).toBe(
      'Contenu personnalise du parcours',
    )
    expect(fetched.goal).toBe("Ameliorer l'equilibre alimentaire")
    expect(new Date(fetched.exitDate).toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    )
    expect(fetched.stopReason).toBe('Programme termine normalement')
    expect(fetched.etpFinalOutcome).toBe('Objectifs atteints')
    expect(fetched.referringCaregiver).toBe('Dr Martin')
    expect(fetched.followUpToDo).toBe('Controle a 3 mois')
    expect(fetched.notes).toBe('NOTE-PATIENT')
    expect(fetched.details).toBe('DETAIL-PATIENT')

    // Nettoyage : ne pas influencer le test de liste suivant.
    await testDb.patient.delete({ where: { id: patientId } })
  })

  it('la liste des patients contient le patient cree', async () => {
    const created = await post('/patient', {
      firstName: 'Alice',
      lastName: 'Martin',
    })
    expect(created.statusCode).toBe(201)
    const patientId = created.json().id as string

    const list = (await get('/patient')).json() as { id: string }[]
    expect(list.map((p) => p.id)).toContain(patientId)

    await testDb.patient.delete({ where: { id: patientId } })
  })

  it('la suppression retire le patient, ses diagnostics et ses problemes d inscription', async () => {
    const created = await post('/patient', {
      firstName: 'Paul',
      lastName: 'Durand',
    })
    expect(created.statusCode).toBe(201)
    const patientId = created.json().id as string

    const diagnostic = await testDb.diagnosticEducatif.create({
      data: {
        establishmentId,
        serviceId,
        patientId,
        activeFields: [],
      },
    })

    const enrollmentIssue = await testDb.enrollmentIssue.create({
      data: {
        establishmentId,
        serviceId,
        patientId,
        pathwayTemplateID: 'pathway-inexistant',
        reason: 'Aucun creneau disponible',
        startDate: new Date('2026-01-01T00:00:00Z'),
      },
    })

    const res = await del(`/patient/${patientId}`)
    expect(res.statusCode).toBe(204)

    expect(
      await testDb.patient.findUnique({ where: { id: patientId } }),
    ).toBeNull()
    expect(
      await testDb.diagnosticEducatif.findUnique({
        where: { id: diagnostic.id },
      }),
    ).toBeNull()
    expect(
      await testDb.enrollmentIssue.findUnique({
        where: { id: enrollmentIssue.id },
      }),
    ).toBeNull()
  })

  it("l'export Excel repond 200 avec un corps non vide", async () => {
    const created = await post('/patient', {
      firstName: 'Export',
      lastName: 'Test',
    })
    expect(created.statusCode).toBe(201)
    const patientId = created.json().id as string

    const res = await get('/patient/export')
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.length).toBeGreaterThan(0)

    await testDb.patient.delete({ where: { id: patientId } })
  })
})
