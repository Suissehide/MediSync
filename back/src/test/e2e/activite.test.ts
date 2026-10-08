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
})
