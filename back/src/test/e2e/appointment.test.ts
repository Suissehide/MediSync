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

// Défaut préexistant (task-5-re-review.md, point 3) : `AppointmentRepository.create` passait
// `serviceId` dans la création imbriquée `appointmentPatients: { create: [...] }`, où Prisma
// l'interdit — `serviceId` fait partie de la clé étrangère composite de la relation
// `appointment`, donc implicite dès qu'on crée sous elle. Conséquence : tout rendez-vous pris
// avec au moins un patient rendait 500, et toute inscription en parcours qui en découle ne
// créait aucun rendez-vous (l'échec était avalé par un `catch {}` muet dans
// `patient.domain.ts`, `enrollOnPathway`, qui rendait un 200 avec `success: false`). Origine :
// commit `dacff75`, 2026-09-22 (étape 1/2 du multi-tenant), pas la tâche 5 — mais c'est la
// fonction quotidienne de l'application, et rien ne la voyait avant ce fichier.
describe('rendez-vous avec un patient', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let cookies: Cookies

  const post = (url: string, payload: unknown) =>
    testApp.app.inject({
      method: 'POST',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies,
      payload: payload as never,
    })

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-RDV')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-RDV')
    serviceId = service.id

    await createUser({
      email: 'coordinateur@appointment.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })

    testApp = await buildTestApp()
    cookies = await signIn(testApp.app, 'coordinateur@appointment.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('POST /appointment avec un patientID cree le rendez-vous, pas un 500', async () => {
    const patientCreated = await post('/patient', {
      firstName: 'Jean',
      lastName: 'Rendezvous',
    })
    expect(patientCreated.statusCode).toBe(201)
    const patientId = patientCreated.json().id as string

    const slotTemplate = await testDb.slotTemplate.create({
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
    const slot = await testDb.slot.create({
      data: {
        startDate: new Date('2026-04-01T09:00:00Z'),
        endDate: new Date('2026-04-01T10:00:00Z'),
        serviceId,
        establishmentId,
        slotTemplateID: slotTemplate.id,
      },
    })

    const appointmentRes = await post('/appointment', {
      startDate: '2026-04-01T09:00:00.000Z',
      endDate: '2026-04-01T09:30:00.000Z',
      slotID: slot.id,
      patientIDs: [patientId],
    })

    expect(appointmentRes.statusCode).toBe(201)
    const body = appointmentRes.json() as {
      id: string
      appointmentPatients: { patientId?: string; patient?: { id: string } }[]
    }
    expect(body.appointmentPatients).toHaveLength(1)

    const appointmentPatients = await testDb.appointmentPatient.findMany({
      where: { appointmentId: body.id },
    })
    expect(appointmentPatients).toHaveLength(1)
    expect(appointmentPatients[0].patientId).toBe(patientId)

    await testDb.patient.delete({ where: { id: patientId } })
  })

  it('une inscription dans un vrai parcours produit reellement un rendez-vous', async () => {
    const pathwayTemplate = await testDb.pathwayTemplate.create({
      data: {
        name: 'Parcours RDV',
        color: '#fff',
        mainTag: 'TAG-RDV',
        secondaryTags: [],
        serviceId,
        establishmentId,
      },
    })
    const slotTemplate = await testDb.slotTemplate.create({
      data: {
        startTime: new Date('2026-04-02T09:00:00Z'),
        endTime: new Date('2026-04-02T10:00:00Z'),
        offsetDays: 0,
        isIndividual: true,
        color: '#fff',
        serviceId,
        establishmentId,
        templateID: pathwayTemplate.id,
      },
    })
    const pathway = await testDb.pathway.create({
      data: {
        startDate: new Date('2026-04-02'),
        templateID: pathwayTemplate.id,
        serviceId,
        establishmentId,
      },
    })
    const slot = await testDb.slot.create({
      data: {
        startDate: new Date('2026-04-02T09:00:00Z'),
        endDate: new Date('2026-04-02T10:00:00Z'),
        serviceId,
        establishmentId,
        slotTemplateID: slotTemplate.id,
        pathwayID: pathway.id,
      },
    })

    const enrollRes = await post('/patient/enroll', {
      patientData: { firstName: 'Marie', lastName: 'Parcours' },
      startDate: '2026-04-02T00:00:00.000Z',
      pathways: [{ tag: 'TAG-RDV', timeOfDay: 'ALL_DAY' }],
    })

    expect(enrollRes.statusCode).toBe(201)
    const result = enrollRes.json() as {
      patient: { id: string }
      enrollments: { appointments: { success: boolean; error?: string }[] }[]
      failedEnrollments: unknown[]
    }
    const patientId = result.patient.id

    // La preuve qui manquait : pas seulement un `success: true` dans la reponse HTTP (que le
    // catch muet aurait pu laisser passer par ailleurs), mais un vrai rendez-vous en base,
    // rattache au bon creneau et au bon patient.
    expect(result.failedEnrollments).toHaveLength(0)
    expect(result.enrollments).toHaveLength(1)
    expect(result.enrollments[0].appointments).toHaveLength(1)
    expect(result.enrollments[0].appointments[0].success).toBe(true)
    expect(result.enrollments[0].appointments[0].error).toBeUndefined()

    const appointment = await testDb.appointment.findFirst({
      where: { slotID: slot.id },
    })
    expect(appointment).not.toBeNull()

    const appointmentPatients = await testDb.appointmentPatient.findMany({
      where: { appointmentId: appointment?.id },
    })
    expect(appointmentPatients).toHaveLength(1)
    expect(appointmentPatients[0].patientId).toBe(patientId)

    await testDb.patient.delete({ where: { id: patientId } })
  })
})
