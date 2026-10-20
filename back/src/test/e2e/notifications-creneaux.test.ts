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
type Payload = Record<string, unknown>

describe('NotificationDispatcher, creneaux et inscriptions', () => {
  let t: TestApp
  let E: string
  let A: string
  let S: string
  let Tm: string
  let coordC: Cookies

  const ids: Record<string, string> = {}

  const url = (path: string) => tenantUrl(E, A, path)

  const patch = (path: string, body: Payload) =>
    t.app.inject({
      method: 'PATCH',
      url: url(path),
      cookies: coordC,
      payload: body,
    })

  // Memes helpers que notifications-rendez-vous.test.ts : les notifications s'ecrivent en tache
  // de fond, on attend qu'elles apparaissent (ou, pour un attendu nul, on attend sans retour
  // anticipe avant de constater une absence).
  const compteFiltre = async (
    email: string,
    type: string,
    predicate: (payload: Payload) => boolean,
    attendu: number,
  ) => {
    const compte = (rows: { payload: unknown }[]) =>
      rows.filter((r) => predicate(r.payload as Payload)).length
    if (attendu === 0) {
      await new Promise((r) => setTimeout(r, 400))
      const rows = await testDb.notification.findMany({
        where: { userId: ids[email], type },
      })
      return compte(rows)
    }
    for (let i = 0; i < 40; i += 1) {
      const rows = await testDb.notification.findMany({
        where: { userId: ids[email], type },
      })
      const n = compte(rows)
      if (n >= attendu) {
        return n
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    const rows = await testDb.notification.findMany({
      where: { userId: ids[email], type },
    })
    return compte(rows)
  }

  const comptePourRdv = (
    email: string,
    type: string,
    rdv: string,
    attendu: number,
  ) => compteFiltre(email, type, (p) => p.appointmentId === rdv, attendu)

  const comptePourSlot = (
    email: string,
    type: string,
    slotId: string,
    attendu: number,
  ) => compteFiltre(email, type, (p) => p.slotId === slotId, attendu)

  const comptePourPatient = (
    email: string,
    type: string,
    patientId: string,
    attendu: number,
  ) => compteFiltre(email, type, (p) => p.patientId === patientId, attendu)

  const dernierPourRdv = async (email: string, type: string, rdv: string) => {
    const rows = await testDb.notification.findMany({
      where: { userId: ids[email], type },
    })
    return rows
      .map((r) => r.payload as Payload)
      .find((p) => p.appointmentId === rdv)
  }

  const dernierPourPatient = async (
    email: string,
    type: string,
    patientId: string,
  ) => {
    const rows = await testDb.notification.findMany({
      where: { userId: ids[email], type },
    })
    return rows
      .map((r) => r.payload as Payload)
      .find((p) => p.patientId === patientId)
  }

  // Un modele de creneau non individuel lie a un soignant donne, avec sa salle.
  const creerCreneau = async (
    start: string,
    end: string,
    soignantId: string,
    extra: { capacity?: number; locationID?: string } = {},
  ) => {
    const slotTemplate = await testDb.slotTemplate.create({
      data: {
        startTime: new Date(start),
        endTime: new Date(end),
        offsetDays: 0,
        isIndividual: false,
        capacity: extra.capacity ?? 10,
        locationID: extra.locationID,
        color: '#fff',
        establishmentId: E,
        serviceId: A,
      },
    })
    await testDb.slotTemplateSoignant.create({
      data: {
        slotTemplateId: slotTemplate.id,
        soignantId,
        serviceId: A,
        establishmentId: E,
      },
    })
    const slot = await testDb.slot.create({
      data: {
        startDate: new Date(start),
        endDate: new Date(end),
        establishmentId: E,
        serviceId: A,
        slotTemplateID: slotTemplate.id,
      },
    })
    return { slot, slotTemplate }
  }

  const creerPatient = (prenom: string, nom: string) =>
    testDb.patient.create({
      data: {
        firstName: prenom,
        lastName: nom,
        establishmentId: E,
        createDate: new Date(),
      },
    })

  const creerRdv = (slotID: string, start: string, end: string) =>
    testDb.appointment.create({
      data: {
        startDate: new Date(start),
        endDate: new Date(end),
        establishmentId: E,
        serviceId: A,
        slotID,
      },
    })

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    const est = await createEstablishment('E-NOTIF-CRENEAUX')
    E = est.id
    A = (await createService(E, 'S-NOTIF-CRENEAUX')).id

    S = (
      await testDb.soignant.create({
        data: { name: 'IDE', establishmentId: E, serviceId: A },
      })
    ).id
    Tm = (
      await testDb.soignant.create({
        data: { name: 'Dieteticienne', establishmentId: E, serviceId: A },
      })
    ).id

    const membre = (
      role: 'INTERVENANT' | 'LECTURE' | 'COORDINATEUR',
      soignantId?: string,
    ) => [
      { establishmentId: E, services: [{ serviceId: A, role, soignantId }] },
    ]

    const coord = (
      await createUser({
        email: 'coord@c.fr',
        memberships: membre('COORDINATEUR'),
      })
    ).id
    const ide1 = (
      await createUser({
        email: 'ide1@c.fr',
        memberships: membre('INTERVENANT', S),
      })
    ).id
    const ide2 = (
      await createUser({
        email: 'ide2@c.fr',
        memberships: membre('INTERVENANT', S),
      })
    ).id
    const diet = (
      await createUser({
        email: 'diet@c.fr',
        memberships: membre('INTERVENANT', Tm),
      })
    ).id

    Object.assign(ids, { coord, ide1, ide2, diet })
    ids['coord@c.fr'] = coord
    ids['ide1@c.fr'] = ide1
    ids['ide2@c.fr'] = ide2
    ids['diet@c.fr'] = diet

    coordC = await signIn(t.app, 'coord@c.fr')
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  it('deplacement du creneau : une APPOINTMENT_MOVED par rendez-vous ayant des patients, pas chez l auteur', async () => {
    const location = await testDb.location.create({
      data: { name: 'Local A', establishmentId: E, serviceId: A },
    })
    const { slot } = await creerCreneau(
      '2026-11-10T09:00:00Z',
      '2026-11-10T09:30:00Z',
      S,
      { locationID: location.id },
    )
    const patient = await creerPatient('Paul', 'MARTIN')
    const aptAvecPatient = await creerRdv(
      slot.id,
      '2026-11-10T09:00:00Z',
      '2026-11-10T09:30:00Z',
    )
    await testDb.appointmentPatient.create({
      data: {
        establishmentId: E,
        serviceId: A,
        appointmentId: aptAvecPatient.id,
        patientId: patient.id,
      },
    })
    const aptSansPatient = await creerRdv(
      slot.id,
      '2026-11-10T09:00:00Z',
      '2026-11-10T09:30:00Z',
    )

    const res = await patch(`/slot/${slot.id}`, {
      startDate: '2026-11-12T10:00:00.000Z',
      endDate: '2026-11-12T10:30:00.000Z',
    })
    expect(res.statusCode).toBe(200)

    expect(
      await comptePourRdv(
        'ide1@c.fr',
        'APPOINTMENT_MOVED',
        aptAvecPatient.id,
        1,
      ),
    ).toBeGreaterThanOrEqual(1)
    expect(
      await comptePourRdv(
        'ide1@c.fr',
        'APPOINTMENT_MOVED',
        aptSansPatient.id,
        0,
      ),
    ).toBe(0)
    expect(
      await comptePourRdv(
        'coord@c.fr',
        'APPOINTMENT_MOVED',
        aptAvecPatient.id,
        0,
      ),
    ).toBe(0)

    const payload = await dernierPourRdv(
      'ide1@c.fr',
      'APPOINTMENT_MOVED',
      aptAvecPatient.id,
    )
    expect(payload).toMatchObject({
      before: { locationName: 'Local A' },
      after: { startDate: '2026-11-12T10:00:00.000Z' },
    })
  })

  it('changement de salle du creneau : APPOINTMENT_MOVED avec le nom avant et apres', async () => {
    const bureau2 = await testDb.location.create({
      data: { name: 'Bureau 2', establishmentId: E, serviceId: A },
    })
    const salleVerte = await testDb.location.create({
      data: { name: 'Salle Verte', establishmentId: E, serviceId: A },
    })
    const { slot, slotTemplate } = await creerCreneau(
      '2026-11-13T09:00:00Z',
      '2026-11-13T09:30:00Z',
      S,
      { locationID: bureau2.id },
    )
    const patient = await creerPatient('Jean', 'DURAND')
    const apt = await creerRdv(
      slot.id,
      '2026-11-13T09:00:00Z',
      '2026-11-13T09:30:00Z',
    )
    await testDb.appointmentPatient.create({
      data: {
        establishmentId: E,
        serviceId: A,
        appointmentId: apt.id,
        patientId: patient.id,
      },
    })

    const res = await patch(`/slot/${slot.id}`, {
      slotTemplate: { id: slotTemplate.id, locationID: salleVerte.id },
    })
    expect(res.statusCode).toBe(200)

    expect(
      await comptePourRdv('ide1@c.fr', 'APPOINTMENT_MOVED', apt.id, 1),
    ).toBeGreaterThanOrEqual(1)
    const payload = await dernierPourRdv(
      'ide1@c.fr',
      'APPOINTMENT_MOVED',
      apt.id,
    )
    expect(payload).toMatchObject({
      before: { locationName: 'Bureau 2' },
      after: { locationName: 'Salle Verte' },
    })
  })

  it('archivage d un creneau avec patients : APPOINTMENT_CANCELLED ; creneau vide : rien', async () => {
    const { slot: slotAvecPatients } = await creerCreneau(
      '2026-11-14T09:00:00Z',
      '2026-11-14T09:30:00Z',
      S,
    )
    const patient = await creerPatient('Claire', 'LEFEBVRE')
    const apt = await creerRdv(
      slotAvecPatients.id,
      '2026-11-14T09:00:00Z',
      '2026-11-14T09:30:00Z',
    )
    await testDb.appointmentPatient.create({
      data: {
        establishmentId: E,
        serviceId: A,
        appointmentId: apt.id,
        patientId: patient.id,
      },
    })

    const res = await patch(`/slot/${slotAvecPatients.id}`, {
      archivedAt: '2026-11-14T08:00:00.000Z',
    })
    expect(res.statusCode).toBe(200)
    expect(
      await comptePourRdv('ide1@c.fr', 'APPOINTMENT_CANCELLED', apt.id, 1),
    ).toBeGreaterThanOrEqual(1)

    const { slot: slotVide } = await creerCreneau(
      '2026-11-15T09:00:00Z',
      '2026-11-15T09:30:00Z',
      S,
    )
    const resVide = await patch(`/slot/${slotVide.id}`, {
      archivedAt: '2026-11-15T08:00:00.000Z',
    })
    expect(resVide.statusCode).toBe(200)
    expect(
      await comptePourSlot(
        'ide1@c.fr',
        'APPOINTMENT_CANCELLED',
        slotVide.id,
        0,
      ),
    ).toBe(0)
  })

  it('suppression d un creneau dont le seul rendez-vous est vide de patients : rien', async () => {
    const { slot } = await creerCreneau(
      '2026-11-16T09:00:00Z',
      '2026-11-16T09:30:00Z',
      S,
    )
    await creerRdv(slot.id, '2026-11-16T09:00:00Z', '2026-11-16T09:30:00Z')

    const res = await t.app.inject({
      method: 'DELETE',
      url: url(`/slot/${slot.id}`),
      cookies: coordC,
    })
    expect(res.statusCode).toBe(204)
    expect(
      await comptePourSlot('ide1@c.fr', 'APPOINTMENT_CANCELLED', slot.id, 0),
    ).toBe(0)
  })

  it('inscription a un parcours de plusieurs seances : une PATIENT_ADDED groupee par soignant, avec son compte', async () => {
    const template = await testDb.pathwayTemplate.create({
      data: {
        name: 'PARCOURS-MULTI',
        color: '#123456',
        mainTag: 'PARCOURS-MULTI',
        secondaryTags: [],
        establishmentId: E,
        serviceId: A,
      },
    })
    const pathway = await testDb.pathway.create({
      data: {
        startDate: new Date('2026-11-20T00:00:00Z'),
        templateID: template.id,
        establishmentId: E,
        serviceId: A,
      },
    })
    const seance = async (start: string, soignantId: string) => {
      const end = new Date(
        new Date(start).getTime() + 30 * 60 * 1000,
      ).toISOString()
      const slotTemplate = await testDb.slotTemplate.create({
        data: {
          startTime: new Date(start),
          endTime: new Date(end),
          offsetDays: 0,
          isIndividual: false,
          capacity: 10,
          color: '#fff',
          templateID: template.id,
          establishmentId: E,
          serviceId: A,
        },
      })
      await testDb.slotTemplateSoignant.create({
        data: {
          slotTemplateId: slotTemplate.id,
          soignantId,
          serviceId: A,
          establishmentId: E,
        },
      })
      await testDb.slot.create({
        data: {
          startDate: new Date(start),
          endDate: new Date(end),
          pathwayID: pathway.id,
          slotTemplateID: slotTemplate.id,
          serviceId: A,
          establishmentId: E,
        },
      })
    }
    await seance('2026-11-20T09:00:00Z', S)
    await seance('2026-11-20T10:00:00Z', S)
    await seance('2026-11-20T11:00:00Z', Tm)

    const createdPatient = await t.app.inject({
      method: 'POST',
      url: url('/patient'),
      cookies: coordC,
      payload: { firstName: 'Ana', lastName: 'ENROLL' },
    })
    expect(createdPatient.statusCode).toBe(201)
    const patientId = createdPatient.json().id as string

    const res = await t.app.inject({
      method: 'POST',
      url: url(`/patient/${patientId}/enroll`),
      cookies: coordC,
      payload: {
        patientID: patientId,
        startDate: '2026-11-01T00:00:00.000Z',
        pathways: [{ tag: 'PARCOURS-MULTI', timeOfDay: 'ALL_DAY' }],
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().failedEnrollments).toEqual([])

    expect(
      await comptePourPatient('ide1@c.fr', 'PATIENT_ADDED', patientId, 1),
    ).toBe(1)
    expect(
      await comptePourPatient('diet@c.fr', 'PATIENT_ADDED', patientId, 1),
    ).toBe(1)
    expect(
      await comptePourPatient('coord@c.fr', 'PATIENT_ADDED', patientId, 0),
    ).toBe(0)

    const ide1Payload = await dernierPourPatient(
      'ide1@c.fr',
      'PATIENT_ADDED',
      patientId,
    )
    expect(ide1Payload).toMatchObject({ count: 2 })
    const dietPayload = await dernierPourPatient(
      'diet@c.fr',
      'PATIENT_ADDED',
      patientId,
    )
    expect(dietPayload).toMatchObject({ count: 1 })
  })

  it('creneau presque complet : une seule SLOT_ALMOST_FULL, dedupliquee, jamais en capacite 1', async () => {
    const { slot } = await creerCreneau(
      '2026-11-21T09:00:00Z',
      '2026-11-21T09:30:00Z',
      S,
      { capacity: 3 },
    )
    const apt = await creerRdv(
      slot.id,
      '2026-11-21T09:00:00Z',
      '2026-11-21T09:30:00Z',
    )
    const P1 = await creerPatient('Un', 'PATIENT')
    const P2 = await creerPatient('Deux', 'PATIENT')
    const P3 = await creerPatient('Trois', 'PATIENT')

    const ajoute = async (ids2: { id?: string; patientID: string }[]) => {
      const r = await patch(`/appointment/${apt.id}`, {
        appointmentPatients: ids2,
      })
      expect(r.statusCode).toBe(200)
      return r.json().appointmentPatients as {
        id: string
        patient: { id: string }
      }[]
    }
    const idDe = (
      rows: { id: string; patient: { id: string } }[],
      patientId: string,
    ) => rows.find((r) => r.patient.id === patientId)?.id as string

    // 1 inscrit : capacite 3, reste 2 places -> rien.
    let rows = await ajoute([{ patientID: P1.id }])
    expect(
      await comptePourSlot('ide1@c.fr', 'SLOT_ALMOST_FULL', slot.id, 0),
    ).toBe(0)

    // 2 inscrits : reste 1 place -> une SLOT_ALMOST_FULL.
    rows = await ajoute([
      { id: idDe(rows, P1.id), patientID: P1.id },
      { patientID: P2.id },
    ])
    expect(
      await comptePourSlot('ide1@c.fr', 'SLOT_ALMOST_FULL', slot.id, 1),
    ).toBeGreaterThanOrEqual(1)

    // On retire P2 puis on le rajoute : toujours une seule notification (cle full:{slotId}).
    rows = await ajoute([{ id: idDe(rows, P1.id), patientID: P1.id }])
    rows = await ajoute([
      { id: idDe(rows, P1.id), patientID: P1.id },
      { patientID: P2.id },
    ])
    expect(
      await comptePourSlot('ide1@c.fr', 'SLOT_ALMOST_FULL', slot.id, 0),
    ).toBe(1)

    // 3 inscrits : complet, pas de nouvelle notification.
    rows = await ajoute([
      { id: idDe(rows, P1.id), patientID: P1.id },
      { id: idDe(rows, P2.id), patientID: P2.id },
      { patientID: P3.id },
    ])
    expect(
      await comptePourSlot('ide1@c.fr', 'SLOT_ALMOST_FULL', slot.id, 0),
    ).toBe(1)

    // Capacite 1 : jamais, meme complet.
    const { slot: slotUnitaire } = await creerCreneau(
      '2026-11-22T09:00:00Z',
      '2026-11-22T09:30:00Z',
      S,
      { capacity: 1 },
    )
    const aptUnitaire = await creerRdv(
      slotUnitaire.id,
      '2026-11-22T09:00:00Z',
      '2026-11-22T09:30:00Z',
    )
    const P4 = await creerPatient('Quatre', 'PATIENT')
    const rUnitaire = await patch(`/appointment/${aptUnitaire.id}`, {
      appointmentPatients: [{ patientID: P4.id }],
    })
    expect(rUnitaire.statusCode).toBe(200)
    expect(
      await comptePourSlot('ide1@c.fr', 'SLOT_ALMOST_FULL', slotUnitaire.id, 0),
    ).toBe(0)
  })
})
