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

// Les conflits sont signales sans bloquer : l'ecriture passe et la reponse les porte.
describe('conflits de planification', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let cookies: Cookies
  let locationID: string
  let patientID: string

  const url = (path: string) => tenantUrl(establishmentId, serviceId, path)

  const inscrire = async (
    slotID: string,
    start: Date,
    end: Date,
    patientId = patientID,
  ) => {
    const appointment = await testDb.appointment.create({
      data: {
        startDate: start,
        endDate: end,
        slotID,
        serviceId,
        establishmentId,
      },
    })
    await testDb.appointmentPatient.create({
      data: {
        appointmentId: appointment.id,
        patientId,
        serviceId,
        establishmentId,
      },
    })
    return appointment
  }

  // Une salle n'est disputée qu'entre créneaux occupés : chacun reçoit son propre patient.
  const creneauOccupe = async (start: string, end: string, salle: string) => {
    const slot = await creneau(start, end, salle)
    const patient = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Occupant',
        lastName: slot.id,
        createDate: new Date(),
      },
    })
    await inscrire(slot.id, slot.startDate, slot.endDate, patient.id)
    return slot
  }

  const creneau = async (start: string, end: string, salle?: string) => {
    const slotTemplate = await testDb.slotTemplate.create({
      data: {
        startTime: new Date(start),
        endTime: new Date(end),
        offsetDays: 0,
        isIndividual: true,
        color: '#fff',
        locationID: salle,
        serviceId,
        establishmentId,
      },
    })
    return testDb.slot.create({
      data: {
        startDate: new Date(start),
        endDate: new Date(end),
        slotTemplateID: slotTemplate.id,
        serviceId,
        establishmentId,
      },
    })
  }

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-CONFLITS')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-CONFLITS')
    serviceId = service.id
    await createUser({
      email: 'coordinateur@conflits.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })
    const location = await testDb.location.create({
      data: { name: 'Salle Bleue', serviceId, establishmentId },
    })
    locationID = location.id
    const patient = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Jeanne',
        lastName: 'Martin',
        createDate: new Date(),
      },
    })
    patientID = patient.id

    testApp = await buildTestApp()
    cookies = await signIn(testApp.app, 'coordinateur@conflits.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('GET /slot/conflicts renvoie deux creneaux qui partagent la salle', async () => {
    const a = await creneauOccupe(
      '2026-04-01T09:00:00Z',
      '2026-04-01T10:00:00Z',
      locationID,
    )
    const b = await creneauOccupe(
      '2026-04-01T09:30:00Z',
      '2026-04-01T10:30:00Z',
      locationID,
    )

    const response = await testApp.app.inject({
      method: 'GET',
      url: url('/slot/conflicts?from=2026-04-01&to=2026-04-02'),
      cookies,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      conflicts: [{ type: 'salle', slotIDs: [a.id, b.id], locationID }],
    })
  })

  it('PATCH /slot enregistre et renvoie le conflit cree, puis plus rien une fois deplace', async () => {
    const c = await creneauOccupe(
      '2026-04-02T14:00:00Z',
      '2026-04-02T15:00:00Z',
      locationID,
    )
    await creneauOccupe(
      '2026-04-02T09:00:00Z',
      '2026-04-02T10:00:00Z',
      locationID,
    )

    const deplace = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/slot/${c.id}`),
      cookies,
      payload: {
        startDate: '2026-04-02T09:30:00.000Z',
        endDate: '2026-04-02T10:30:00.000Z',
      },
    })
    expect(deplace.statusCode).toBe(200)
    expect(deplace.json().startDate).toBe('2026-04-02T09:30:00.000Z')
    expect(deplace.json().conflicts).toEqual([
      expect.objectContaining({ type: 'salle', locationID }),
    ])

    const libere = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/slot/${c.id}`),
      cookies,
      payload: {
        startDate: '2026-04-02T10:00:00.000Z',
        endDate: '2026-04-02T11:00:00.000Z',
      },
    })
    expect(libere.json().conflicts).toEqual([])
  })

  it('PATCH /appointment renvoie le conflit patient quand deux rendez-vous se chevauchent', async () => {
    const s1 = await creneau('2026-04-03T09:00:00Z', '2026-04-03T10:00:00Z')
    const s2 = await creneau('2026-04-03T11:00:00Z', '2026-04-03T12:00:00Z')
    const rendezVous = (slotID: string, start: string, end: string) =>
      inscrire(slotID, new Date(start), new Date(end))
    await rendezVous(s1.id, '2026-04-03T09:00:00Z', '2026-04-03T09:30:00Z')
    const r2 = await rendezVous(
      s2.id,
      '2026-04-03T11:00:00Z',
      '2026-04-03T11:30:00Z',
    )

    const deplace = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/appointment/${r2.id}`),
      cookies,
      payload: {
        slotID: s1.id,
        startDate: '2026-04-03T09:15:00.000Z',
        endDate: '2026-04-03T09:45:00.000Z',
      },
    })

    expect(deplace.statusCode).toBe(200)
    expect(deplace.json().conflicts).toEqual([
      expect.objectContaining({
        type: 'patient',
        slotIDs: [s1.id],
        patientID,
      }),
    ])
  })

  it('POST /slot ne signale pas un creneau neuf, encore vide, dans une salle occupee', async () => {
    await creneauOccupe(
      '2026-04-06T09:00:00Z',
      '2026-04-06T10:00:00Z',
      locationID,
    )
    const slotTemplate = await testDb.slotTemplate.create({
      data: {
        startTime: new Date('2026-04-06T09:30:00Z'),
        endTime: new Date('2026-04-06T10:30:00Z'),
        offsetDays: 0,
        isIndividual: true,
        color: '#fff',
        locationID,
        serviceId,
        establishmentId,
      },
    })

    const cree = await testApp.app.inject({
      method: 'POST',
      url: url('/slot'),
      cookies,
      payload: {
        startDate: '2026-04-06T09:30:00.000Z',
        endDate: '2026-04-06T10:30:00.000Z',
        slotTemplateID: slotTemplate.id,
      },
    })

    expect(cree.statusCode).toBe(201)
    expect(cree.json().conflicts).toEqual([])
  })

  it('POST /appointment renvoie le conflit patient qu il cree', async () => {
    const s1 = await creneau('2026-04-07T09:00:00Z', '2026-04-07T10:00:00Z')
    const s2 = await creneau('2026-04-07T09:00:00Z', '2026-04-07T10:00:00Z')
    await inscrire(
      s1.id,
      new Date('2026-04-07T09:00:00Z'),
      new Date('2026-04-07T09:30:00Z'),
    )

    const cree = await testApp.app.inject({
      method: 'POST',
      url: url('/appointment'),
      cookies,
      payload: {
        startDate: '2026-04-07T09:15:00.000Z',
        endDate: '2026-04-07T09:45:00.000Z',
        type: 'ambulatory',
        slotID: s2.id,
        patientIDs: [patientID],
      },
    })

    expect(cree.statusCode).toBe(201)
    expect(cree.json().conflicts).toEqual([
      expect.objectContaining({
        type: 'patient',
        slotIDs: [s1.id, s2.id],
        patientID,
      }),
    ])
  })

  // Le créneau garde un autre conflit : seule la suppression explique une liste vide.
  it('PATCH /appointment qui vide la liste de patients supprime le rendez-vous et ne signale rien', async () => {
    const s1 = await creneau('2026-04-08T09:00:00Z', '2026-04-08T10:00:00Z')
    const s2 = await creneau('2026-04-08T09:00:00Z', '2026-04-08T10:00:00Z')
    const debut = new Date('2026-04-08T09:00:00Z')
    const fin = new Date('2026-04-08T09:30:00Z')
    await inscrire(s1.id, debut, fin)
    await inscrire(s2.id, debut, fin)
    const autre = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Paul',
        lastName: 'Durand',
        createDate: new Date(),
      },
    })
    const doublon = await inscrire(s2.id, debut, fin, autre.id)

    const vide = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/appointment/${doublon.id}`),
      cookies,
      payload: { appointmentPatients: [] },
    })

    expect(vide.statusCode).toBe(200)
    expect(vide.json().conflicts).toEqual([])
    expect(
      await testDb.appointment.findUnique({ where: { id: doublon.id } }),
    ).toBeNull()
  })
})
