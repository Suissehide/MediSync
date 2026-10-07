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

// Archiver un créneau le sort du Planning sans perdre ses rendez-vous, qui restent sur le Dashboard.
describe('archivage d un creneau', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let cookies: Cookies

  const url = (path: string) => tenantUrl(establishmentId, serviceId, path)

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-SLOT-ARCHIVAGE')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-SLOT-ARCHIVAGE')
    serviceId = service.id

    await createUser({
      email: 'coordinateur@slot-archivage.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })

    testApp = await buildTestApp()
    cookies = await signIn(testApp.app, 'coordinateur@slot-archivage.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('PATCH archivedAt garde le rendez-vous, le renvoie avec le creneau, et se restaure', async () => {
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
        slotTemplateID: slotTemplate.id,
        serviceId,
        establishmentId,
      },
    })
    const appointment = await testDb.appointment.create({
      data: {
        startDate: new Date('2026-04-01T09:00:00Z'),
        endDate: new Date('2026-04-01T09:30:00Z'),
        slotID: slot.id,
        serviceId,
        establishmentId,
      },
    })

    const archive = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/slot/${slot.id}`),
      cookies,
      payload: { archivedAt: '2026-10-08T10:00:00.000Z' },
    })
    expect(archive.statusCode).toBe(200)

    const liste = await testApp.app.inject({
      method: 'GET',
      url: url('/slot?from=2026-04-01&to=2026-04-02'),
      cookies,
    })
    expect(liste.statusCode).toBe(200)
    const [renvoye] = liste.json() as {
      archivedAt: string | null
      appointments: { id: string }[]
    }[]
    expect(renvoye.archivedAt).toBe('2026-10-08T10:00:00.000Z')
    expect(renvoye.appointments.map((a) => a.id)).toEqual([appointment.id])

    const restaure = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/slot/${slot.id}`),
      cookies,
      payload: { archivedAt: null },
    })
    expect(restaure.statusCode).toBe(200)
    const ligne = await testDb.slot.findUnique({ where: { id: slot.id } })
    expect(ligne?.archivedAt).toBeNull()
  })
})
