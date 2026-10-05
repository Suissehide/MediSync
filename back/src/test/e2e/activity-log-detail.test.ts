import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

// Le detail d'une ligne du journal : ce qu'elle designe, en clair, fige au moment de l'action.

let t: TestApp
let establishmentId: string
let serviceId: string
let cookies: Record<string, string>

beforeAll(async () => {
  t = await buildTestApp()
  await truncateAll()
  establishmentId = (await createEstablishment('E')).id
  serviceId = (await createService(establishmentId, 'S')).id
  await createUser({
    email: 'coord@exemple.test',
    memberships: [
      { establishmentId, services: [{ serviceId, role: 'COORDINATEUR' }] },
    ],
  })
  cookies = await signIn(t.app, 'coord@exemple.test')
})

afterAll(async () => {
  await t.close()
  await testDb.$disconnect()
})

// Ecrit en « tire et oublie » : on attend la ligne de cette action.
const ligne = async (action: string) => {
  for (let essai = 0; essai < 40; essai += 1) {
    const trouvee = await testDb.activityLog.findFirst({
      where: { establishmentId, action },
      orderBy: { createdAt: 'desc' },
    })
    if (trouvee) {
      return trouvee
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return null
}

describe('journal d activite : le detail de chaque ligne', () => {
  let patientId: string

  it('nomme le patient cree', async () => {
    const cree = await t.app.inject({
      method: 'POST',
      url: tenantUrl(establishmentId, serviceId, '/patient'),
      cookies,
      payload: { firstName: 'Marie', lastName: 'Dupont' } as never,
    })
    expect(cree.statusCode).toBe(201)
    patientId = cree.json().id

    expect((await ligne('patient.created'))?.detail).toBe('Dupont Marie')
  })

  it('decrit le rendez-vous : patients, date, thematique, et ce qui a change', async () => {
    const tenant = { establishmentId, serviceId }
    const thematic = await testDb.thematic.create({
      data: { ...tenant, name: 'Atelier nutrition' },
    })
    const slotTemplate = await testDb.slotTemplate.create({
      data: {
        ...tenant,
        startTime: new Date('1970-01-01T14:00:00Z'),
        endTime: new Date('1970-01-01T15:00:00Z'),
        offsetDays: 0,
        isIndividual: true,
        color: '#000000',
      },
    })
    const slot = await testDb.slot.create({
      data: {
        ...tenant,
        startDate: new Date('2026-10-14T14:00:00Z'),
        endDate: new Date('2026-10-14T15:00:00Z'),
        slotTemplateID: slotTemplate.id,
      },
    })
    const rdv = await testDb.appointment.create({
      data: {
        ...tenant,
        startDate: new Date('2026-10-14T14:00:00Z'),
        endDate: new Date('2026-10-14T15:00:00Z'),
        slotID: slot.id,
        thematicId: thematic.id,
      },
    })
    const participant = await testDb.appointmentPatient.create({
      data: { ...tenant, appointmentId: rdv.id, patientId },
    })

    const res = await t.app.inject({
      method: 'PATCH',
      url: tenantUrl(
        establishmentId,
        serviceId,
        `/appointment/${rdv.id}/patients/${participant.id}/convocation`,
      ),
      cookies,
      payload: { convocationSent: true },
    })
    expect(res.statusCode).toBe(204)

    expect((await ligne('appointment.updated'))?.detail).toBe(
      'Dupont Marie — 14/10/2026 à 14:00 — Atelier nutrition — convocation envoyée',
    )
  })

  it('le sert au journal du service', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: tenantUrl(establishmentId, serviceId, '/activity-log'),
      cookies,
    })
    const details = (
      res.json() as { data: { detail: string | null }[] }
    ).data.map((l) => l.detail)
    expect(details).toContain('Dupont Marie')
  })

  it('nomme le membre et son role dans le service', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: tenantUrl(establishmentId, serviceId, '/membres'),
      cookies,
      payload: {
        email: 'paul@exemple.test',
        firstName: 'Paul',
        lastName: 'Martin',
        role: 'INTERVENANT',
      },
    })
    expect(res.statusCode).toBeLessThan(300)

    expect((await ligne('serviceMember.accountCreated'))?.detail).toBe(
      'Martin Paul (Intervenant)',
    )
  })

  it('garde le nom d un patient supprime', async () => {
    const res = await t.app.inject({
      method: 'DELETE',
      url: tenantUrl(establishmentId, serviceId, `/patient/${patientId}`),
      cookies,
    })
    expect(res.statusCode).toBeLessThan(300)

    expect((await ligne('patient.deleted'))?.detail).toBe('Dupont Marie')
  })
})
