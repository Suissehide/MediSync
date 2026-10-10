import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

describe('tableau de bord d activite', () => {
  let t: TestApp
  let establishmentId: string
  let serviceA: string
  let serviceB: string
  let cookies: { access_token: string }
  let coordinateurCookies: { access_token: string }

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    const est = await createEstablishment()
    establishmentId = est.id
    serviceA = (await createService(est.id, 'Service A')).id
    serviceB = (await createService(est.id, 'Service B')).id
    await createUser({
      email: 'direction@test.fr',
      memberships: [
        {
          establishmentId,
          services: [
            { serviceId: serviceA, role: 'LECTURE' },
            { serviceId: serviceB, role: 'LECTURE' },
          ],
        },
      ],
    })
    cookies = await signIn(t.app, 'direction@test.fr')
    // Seule une personne COORDINATEUR peut regler les champs et l'Activite (stats:write).
    await createUser({
      email: 'coordinateur@test.fr',
      memberships: [
        {
          establishmentId,
          services: [{ serviceId: serviceB, role: 'COORDINATEUR' }],
        },
      ],
    })
    coordinateurCookies = await signIn(t.app, 'coordinateur@test.fr')
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  const lire = (serviceId: string, periode = 'from=2026-01-01&to=2026-12-31') =>
    t.app.inject({
      method: 'GET',
      url: tenantUrl(establishmentId, serviceId, `/activite?${periode}`),
      cookies,
    })

  const seance = async (
    serviceId: string,
    patientId: string,
    status: 'yes' | 'no',
    pathwayID?: string,
  ) => {
    const soignant = await testDb.soignant.create({
      data: { name: 'IDE', serviceId, establishmentId },
    })
    const template = await testDb.slotTemplate.create({
      data: {
        startTime: new Date(),
        endTime: new Date(),
        offsetDays: 0,
        isIndividual: true,
        color: '#fff',
        serviceId,
        establishmentId,
      },
    })
    await testDb.slotTemplateSoignant.create({
      data: {
        slotTemplateId: template.id,
        soignantId: soignant.id,
        serviceId,
        establishmentId,
      },
    })
    const slot = await testDb.slot.create({
      data: {
        startDate: new Date('2026-06-01T09:00:00Z'),
        endDate: new Date('2026-06-01T10:30:00Z'),
        serviceId,
        establishmentId,
        slotTemplateID: template.id,
        pathwayID,
      },
    })
    const appointment = await testDb.appointment.create({
      data: {
        startDate: slot.startDate,
        endDate: slot.endDate,
        type: 'ambulatory',
        serviceId,
        establishmentId,
        slotID: slot.id,
      },
    })
    await testDb.appointmentPatient.create({
      data: {
        appointmentId: appointment.id,
        patientId,
        serviceId,
        establishmentId,
        status,
      },
    })
  }

  it('ouvre l ecran a la lecture et isole les services', async () => {
    const patient = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Nominatif',
        lastName: 'Interdit',
        createDate: new Date(),
      },
    })
    await seance(serviceA, patient.id, 'yes')
    await seance(serviceB, patient.id, 'no')

    const a = await lire(serviceA)
    expect(a.statusCode).toBe(200)
    expect(a.json().patients.active).toBe(1)
    expect(a.json().absences.overall).toMatchObject({ absent: 0, pointed: 1 })
    expect(a.json().hoursBySoignant).toEqual([{ soignant: 'IDE', hours: 1.5 }])

    const b = await lire(serviceB)
    expect(b.json().patients.active).toBe(0)
    expect(b.json().absences.overall).toMatchObject({ absent: 1, pointed: 1 })
  })

  // L'exigence centrale : la reponse, seule source du CSV, ne porte aucun nom ni identifiant.
  it('ne laisse passer aucun nom ni identifiant de patient', async () => {
    const res = await lire(serviceA)
    const patient = await testDb.patient.findFirstOrThrow({
      where: { lastName: 'Interdit' },
    })
    const corps = res.body
    expect(
      ['Nominatif', 'Interdit', patient.id].filter((terme) =>
        corps.includes(terme),
      ),
    ).toEqual([])
  })

  it('refuse une periode dont la fin precede le debut', async () => {
    const res = await lire(serviceA, 'from=2026-12-31&to=2026-01-01')
    expect(res.statusCode).toBe(400)
  })

  it('filtre par modele de parcours, ajoute monthly et byWeekday', async () => {
    // serviceB : aucun patient actif avant ce test (le seul rendez-vous existant y est en absence).
    const template = await testDb.pathwayTemplate.create({
      data: {
        name: 'Réadaptation',
        color: '#fff',
        mainTag: 'TAG-FILTRE-PARCOURS',
        secondaryTags: [],
        serviceId: serviceB,
        establishmentId,
      },
    })
    const pathway = await testDb.pathway.create({
      data: {
        startDate: new Date('2026-06-01'),
        templateID: template.id,
        serviceId: serviceB,
        establishmentId,
      },
    })
    const patientA = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Parcours',
        lastName: 'A',
        createDate: new Date(),
      },
    })
    const patientB = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'SansParcours',
        lastName: 'B',
        createDate: new Date(),
      },
    })
    await seance(serviceB, patientA.id, 'yes', pathway.id)
    await seance(serviceB, patientB.id, 'yes')

    const avecFiltre = await lire(
      serviceB,
      `from=2026-01-01&to=2026-12-31&pathwayTemplateId=${template.id}`,
    )
    expect(avecFiltre.statusCode).toBe(200)
    expect(avecFiltre.json().patients.active).toBe(1)
    expect(avecFiltre.json().monthly).toHaveLength(12)
    expect(avecFiltre.json().absences.byWeekday).toHaveLength(7)

    const sansFiltre = await lire(serviceB)
    expect(sansFiltre.json().patients.active).toBe(2)

    const idInconnu = await lire(
      serviceB,
      'from=2026-01-01&to=2026-12-31&pathwayTemplateId=cliduinconnu0000000000000',
    )
    expect(idInconnu.statusCode).toBe(200)
    expect(idInconnu.json().patients.active).toBe(0)
  })

  // Review Focus 3 (decision 4, spec §2.4) : sans reglage, pas de bloc motifs/completion.
  it('ne porte pas de completion sans reglage de motif d arret', async () => {
    const res = await lire(serviceA)
    expect(res.statusCode).toBe(200)
    expect(res.json().completion).toBeNull()
  })

  it('lit le champ et la valeur de fin designes dans les reglages, pas stopReason', async () => {
    const champ = await t.app.inject({
      method: 'POST',
      url: tenantUrl(establishmentId, serviceB, '/service-fields'),
      cookies: coordinateurCookies,
      payload: {
        label: 'Motif sortie',
        type: 'choice',
        section: 'outcome',
        choices: ['Perdu de vue', 'Terminé'],
      },
    })
    expect(champ.statusCode).toBe(201)
    const field = champ.json() as {
      key: string
      choices: { key: string; label: string }[]
    }
    const termine = field.choices.find((c) => c.label === 'Terminé')
    expect(termine).toBeDefined()

    const reglages = await t.app.inject({
      method: 'PATCH',
      url: tenantUrl(establishmentId, serviceB, '/activity-settings'),
      cookies: coordinateurCookies,
      payload: {
        stopReasonFieldKey: field.key,
        completedChoiceKey: termine?.key,
      },
    })
    expect(reglages.statusCode).toBe(200)

    const patientAbandon = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Motif',
        lastName: 'Configurable',
        createDate: new Date(),
      },
    })
    await testDb.patientServiceFile.create({
      data: {
        establishmentId,
        serviceId: serviceB,
        patientId: patientAbandon.id,
        exitDate: new Date('2026-06-01'),
        data: { [field.key]: 'PERDU_DE_VUE', stopReason: 'DECES' },
      },
    })

    const res = await lire(serviceB)
    expect(res.statusCode).toBe(200)
    expect(res.json().completion).toMatchObject({
      dropouts: 1,
      dropoutReasons: [
        { reason: 'PERDU_DE_VUE', label: 'Perdu de vue', count: 1 },
      ],
    })
  })
})
