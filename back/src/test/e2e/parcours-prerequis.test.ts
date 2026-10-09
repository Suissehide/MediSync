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

// Un parcours B qui dépend de A ne commence qu'après le dernier rendez-vous du patient en A.
describe('parcours prérequis', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let cookies: Cookies

  const inject = (method: 'POST' | 'PATCH', path: string, payload: unknown) =>
    testApp.app.inject({
      method,
      url: tenantUrl(establishmentId, serviceId, path),
      cookies,
      payload: payload as never,
    })

  const createTemplate = async (mainTag: string, prerequisiteIDs: string[]) => {
    const res = await inject('POST', '/pathway-template', {
      name: mainTag,
      color: '#123456',
      mainTag,
      slotTemplateIDs: [],
      prerequisiteIDs,
    })
    expect(res.statusCode).toBe(201)
    return res.json().id as string
  }

  // Une instance de parcours d'un seul créneau collectif.
  const createPathway = async (templateID: string, start: string) => {
    const startDate = new Date(start)
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000)
    const slotTemplate = await testDb.slotTemplate.create({
      data: {
        startTime: startDate,
        endTime: endDate,
        offsetDays: 0,
        isIndividual: false,
        capacity: 10,
        color: '#fff',
        templateID,
        serviceId,
        establishmentId,
      },
    })
    const pathway = await testDb.pathway.create({
      data: { startDate, templateID, serviceId, establishmentId },
    })
    await testDb.slot.create({
      data: {
        startDate,
        endDate,
        pathwayID: pathway.id,
        slotTemplateID: slotTemplate.id,
        serviceId,
        establishmentId,
      },
    })
    return pathway.id
  }

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-PREREQUIS')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-PREREQUIS')
    serviceId = service.id
    await createUser({
      email: 'coordinateur@prerequis.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })
    testApp = await buildTestApp()
    cookies = await signIn(testApp.app, 'coordinateur@prerequis.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('refuse une dépendance circulaire', async () => {
    const a = await createTemplate('CYCLE-A', [])
    const b = await createTemplate('CYCLE-B', [a])
    const res = await inject('PATCH', `/pathway-template/${a}`, {
      prerequisiteIDs: [b],
    })
    expect(res.statusCode).toBe(400)
  })

  it('inscrit B sur la première instance qui commence après la fin de A', async () => {
    const a = await createTemplate('PRE-A', [])
    const b = await createTemplate('PRE-B', [a])
    await createPathway(a, '2026-11-10T09:00:00.000Z')
    await createPathway(b, '2026-11-02T09:00:00.000Z')
    const bAfterA = await createPathway(b, '2026-11-17T09:00:00.000Z')

    const created = await inject('POST', '/patient', {
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
    const patientId = created.json().id as string

    // B est demandé avant A : l'ordre des prérequis l'emporte.
    const res = await inject('POST', `/patient/${patientId}/enroll`, {
      patientID: patientId,
      startDate: '2026-11-01T00:00:00.000Z',
      pathways: [
        { tag: 'PRE-B', timeOfDay: 'ALL_DAY' },
        { tag: 'PRE-A', timeOfDay: 'ALL_DAY' },
      ],
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().failedEnrollments).toEqual([])

    const pathwaysOfB = await testDb.appointment.findMany({
      where: {
        appointmentPatients: { some: { patientId } },
        slot: { pathway: { templateID: b } },
      },
      select: { slot: { select: { pathwayID: true } } },
    })
    expect(pathwaysOfB.map((apt) => apt.slot.pathwayID)).toEqual([bAfterA])
  })

  it('donne la date de départ de chaque parcours selon sa propre date de début, sans rien écrire', async () => {
    const t = await createTemplate('APERCU', [])
    await createPathway(t, '2026-12-01T09:00:00.000Z')
    await createPathway(t, '2026-12-15T09:00:00.000Z')

    const res = await inject('POST', '/patient/enroll/preview', {
      pathways: [
        {
          tag: 'APERCU',
          timeOfDay: 'ALL_DAY',
          startDate: '2026-11-20T00:00:00.000Z',
        },
        {
          tag: 'APERCU',
          timeOfDay: 'ALL_DAY',
          startDate: '2026-12-10T00:00:00.000Z',
        },
        { tag: 'INCONNU', timeOfDay: 'ALL_DAY', startDate: '2026-12-10' },
      ],
    })
    expect(res.statusCode).toBe(200)
    const [first, second, unknown] = res.json()
    expect(first.startDate).toBe('2026-12-01T09:00:00.000Z')
    expect(second.startDate).toBe('2026-12-15T09:00:00.000Z')
    expect(unknown.startDate).toBeNull()
    expect(unknown.reason).toBeTruthy()
    expect(
      await testDb.appointment.count({
        where: { slot: { pathway: { templateID: t } } },
      }),
    ).toBe(0)
  })
})
