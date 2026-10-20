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

describe('NotificationDispatcher et rendez-vous', () => {
  let t: TestApp
  let E: string
  let A: string
  let S: string
  let coordC: Cookies

  let appointmentId: string
  let ap1: string
  let P1: string
  let P2: string
  let P3: string
  let P4: string
  let troisiemeRdv: string
  let autreRdv: string

  // Un modele de creneau de plus, lie a S, pour un test autonome (meme patron qu'au beforeAll).
  const nouveauCreneau = async (
    start: string,
    end: string,
    extra: { capacity?: number; thematicId?: string } = {},
  ) => {
    const slotTemplate = await testDb.slotTemplate.create({
      data: {
        startTime: new Date(start),
        endTime: new Date(end),
        offsetDays: 0,
        isIndividual: true,
        capacity: extra.capacity ?? 1,
        thematicId: extra.thematicId,
        color: '#fff',
        establishmentId: E,
        serviceId: A,
      },
    })
    await testDb.slotTemplateSoignant.create({
      data: {
        slotTemplateId: slotTemplate.id,
        soignantId: S,
        serviceId: A,
        establishmentId: E,
      },
    })
    return testDb.slot.create({
      data: {
        startDate: new Date(start),
        endDate: new Date(end),
        establishmentId: E,
        serviceId: A,
        slotTemplateID: slotTemplate.id,
      },
    })
  }

  const ids: Record<string, string> = {}

  const patchAppointment = (id: string, body: Payload) =>
    t.app.inject({
      method: 'PATCH',
      url: tenantUrl(E, A, `/appointment/${id}`),
      cookies: coordC,
      payload: body,
    })

  // Les notifications s'ecrivent en tache de fond : on attend qu'elles apparaissent.
  const notifs = async (email: string, type: string, attendu = 1) => {
    for (let i = 0; i < 40; i += 1) {
      const rows = await testDb.notification.findMany({
        where: { userId: ids[email], type },
      })
      if (rows.length >= attendu) {
        return rows
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    return testDb.notification.findMany({ where: { userId: ids[email], type } })
  }

  const aucune = async (email: string, type: string) => {
    await new Promise((r) => setTimeout(r, 400))
    expect(
      await testDb.notification.count({ where: { userId: ids[email], type } }),
    ).toBe(0)
  }

  // Meme forme que `notifs`, mais ne compte que les lignes d'un rendez-vous donne (le bruit des cas precedents ne doit pas fausser un compte).
  const comptePourRdv = async (
    email: string,
    type: string,
    rdv: string,
    attendu: number,
  ) => {
    const compte = (rows: { payload: unknown }[]) =>
      rows.filter((r) => (r.payload as Payload).appointmentId === rdv).length
    // Attendu = 0 : meme delai que `aucune()`, jamais un retour anticipe sur un compte encore a zero.
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

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    const est = await createEstablishment('E-NOTIF-RDV')
    E = est.id
    A = (await createService(E, 'S-NOTIF-RDV')).id

    S = (
      await testDb.soignant.create({
        data: { name: 'IDE', establishmentId: E, serviceId: A },
      })
    ).id
    const Tm = (
      await testDb.soignant.create({
        data: { name: 'Dieteticienne', establishmentId: E, serviceId: A },
      })
    ).id
    const location = await testDb.location.create({
      data: { name: 'Bureau 2', establishmentId: E, serviceId: A },
    })
    const thematic = await testDb.thematic.create({
      data: { name: 'Alimentation', establishmentId: E, serviceId: A },
    })

    const membre = (
      role: 'INTERVENANT' | 'LECTURE' | 'COORDINATEUR',
      soignantId?: string,
    ) => [
      { establishmentId: E, services: [{ serviceId: A, role, soignantId }] },
    ]

    const coord = (
      await createUser({
        email: 'coord@t.fr',
        memberships: membre('COORDINATEUR'),
      })
    ).id
    const ide1 = (
      await createUser({
        email: 'ide1@t.fr',
        memberships: membre('INTERVENANT', S),
      })
    ).id
    const ide2 = (
      await createUser({
        email: 'ide2@t.fr',
        memberships: membre('INTERVENANT', S),
      })
    ).id
    const ideLecture = (
      await createUser({
        email: 'idelecture@t.fr',
        memberships: membre('LECTURE', S),
      })
    ).id
    const ideOff = (
      await createUser({
        email: 'ideoff@t.fr',
        memberships: membre('INTERVENANT', S),
      })
    ).id
    await testDb.user.update({
      where: { id: ideOff },
      data: { deactivatedAt: new Date() },
    })
    const diet = (
      await createUser({
        email: 'diet@t.fr',
        memberships: membre('INTERVENANT', Tm),
      })
    ).id
    Object.assign(ids, { coord, ide1, ide2, ideLecture, ideOff, diet })
    // Les cles des helpers (notifs/aucune) utilisent l'adresse e-mail.
    ids['coord@t.fr'] = coord
    ids['ide1@t.fr'] = ide1
    ids['ide2@t.fr'] = ide2
    ids['idelecture@t.fr'] = ideLecture
    ids['ideoff@t.fr'] = ideOff
    ids['diet@t.fr'] = diet

    coordC = await signIn(t.app, 'coord@t.fr')

    // Rendez-vous principal : modele lie a S, capacite 3, salle et thematique sur le modele.
    const slotTemplate = await testDb.slotTemplate.create({
      data: {
        startTime: new Date('2026-11-01T09:00:00Z'),
        endTime: new Date('2026-11-01T09:30:00Z'),
        offsetDays: 0,
        isIndividual: false,
        capacity: 3,
        color: '#fff',
        establishmentId: E,
        serviceId: A,
        locationID: location.id,
        thematicId: thematic.id,
      },
    })
    await testDb.slotTemplateSoignant.create({
      data: {
        slotTemplateId: slotTemplate.id,
        soignantId: S,
        serviceId: A,
        establishmentId: E,
      },
    })
    const slot = await testDb.slot.create({
      data: {
        startDate: new Date('2026-11-01T09:00:00Z'),
        endDate: new Date('2026-11-01T09:30:00Z'),
        establishmentId: E,
        serviceId: A,
        slotTemplateID: slotTemplate.id,
      },
    })
    const appointment = await testDb.appointment.create({
      data: {
        startDate: new Date('2026-11-01T09:00:00Z'),
        endDate: new Date('2026-11-01T09:30:00Z'),
        establishmentId: E,
        serviceId: A,
        slotID: slot.id,
      },
    })
    appointmentId = appointment.id

    const patient = (firstName: string, lastName: string) =>
      testDb.patient.create({
        data: {
          firstName,
          lastName,
          establishmentId: E,
          createDate: new Date(),
        },
      })
    P1 = (await patient('Paul', 'MARTIN')).id
    P2 = (await patient('Marie', 'DUBOIS')).id
    P3 = (await patient('Jean', 'DURAND')).id
    P4 = (await patient('Claire', 'LEFEBVRE')).id

    ap1 = (
      await testDb.appointmentPatient.create({
        data: {
          establishmentId: E,
          serviceId: A,
          appointmentId,
          patientId: P1,
        },
      })
    ).id

    // Troisieme rendez-vous : propre modele, meme soignant S, aucun patient au depart.
    const slot3 = await nouveauCreneau(
      '2026-11-02T09:00:00Z',
      '2026-11-02T09:30:00Z',
      { capacity: 5 },
    )
    troisiemeRdv = (
      await testDb.appointment.create({
        data: {
          startDate: new Date('2026-11-02T09:00:00Z'),
          endDate: new Date('2026-11-02T09:30:00Z'),
          establishmentId: E,
          serviceId: A,
          slotID: slot3.id,
        },
      })
    ).id

    // Autre rendez-vous, voue a la suppression : meme soignant et meme thematique, un patient deja present.
    const slot2 = await nouveauCreneau(
      '2026-11-04T09:00:00Z',
      '2026-11-04T09:30:00Z',
      { thematicId: thematic.id },
    )
    const P5 = (await patient('Marie', 'DUBOIS')).id
    autreRdv = (
      await testDb.appointment.create({
        data: {
          startDate: new Date('2026-11-04T09:00:00Z'),
          endDate: new Date('2026-11-04T09:30:00Z'),
          establishmentId: E,
          serviceId: A,
          slotID: slot2.id,
        },
      })
    ).id
    await testDb.appointmentPatient.create({
      data: {
        establishmentId: E,
        serviceId: A,
        appointmentId: autreRdv,
        patientId: P5,
      },
    })
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  it('ajout d un patient : les soignants de la seance, pas l auteur, ni LECTURE, ni desactive, ni un autre metier', async () => {
    const res = await patchAppointment(appointmentId, {
      appointmentPatients: [{ id: ap1, patientID: P1 }, { patientID: P2 }],
    })
    expect(res.statusCode).toBe(200)

    const [n] = await notifs('ide1@t.fr', 'PATIENT_ADDED')
    expect(n?.payload).toMatchObject({
      appointmentId,
      patientId: P2,
      patientName: 'DUBOIS Marie',
      thematicName: 'Alimentation',
      actorId: ids['coord@t.fr'],
    })
    expect(await notifs('ide2@t.fr', 'PATIENT_ADDED')).toHaveLength(1)
    for (const email of [
      'coord@t.fr',
      'idelecture@t.fr',
      'ideoff@t.fr',
      'diet@t.fr',
    ]) {
      await aucune(email, 'PATIENT_ADDED')
    }
  })

  it('creation avec patientIDs : patients ajoutes au meme mouvement, l auteur non notifie', async () => {
    const slot5 = await nouveauCreneau(
      '2026-11-06T09:00:00Z',
      '2026-11-06T09:30:00Z',
    )
    const patientCree = (
      await testDb.patient.create({
        data: {
          firstName: 'Nina',
          lastName: 'ROUX',
          establishmentId: E,
          createDate: new Date(),
        },
      })
    ).id

    const res = await t.app.inject({
      method: 'POST',
      url: tenantUrl(E, A, '/appointment'),
      cookies: coordC,
      payload: {
        startDate: '2026-11-06T09:00:00.000Z',
        endDate: '2026-11-06T09:30:00.000Z',
        slotID: slot5.id,
        patientIDs: [patientCree],
      },
    })
    expect(res.statusCode).toBe(201)
    const nouveauRdv = res.json().id as string

    expect(
      await comptePourRdv('ide1@t.fr', 'PATIENT_ADDED', nouveauRdv, 1),
    ).toBeGreaterThanOrEqual(1)
    expect(
      await comptePourRdv('coord@t.fr', 'PATIENT_ADDED', nouveauRdv, 0),
    ).toBe(0)
  })

  it('absence sans raison : notifiee ; avec raison : rien', async () => {
    const after1 = (
      await testDb.appointment.findFirst({
        where: { id: appointmentId },
        include: { appointmentPatients: true },
      })
    )?.appointmentPatients
    const ap2 = after1?.find((p) => p.patientId === P2)?.id as string

    const res = await patchAppointment(appointmentId, {
      appointmentPatients: [
        { id: ap1, patientID: P1, status: 'no' },
        { id: ap2, patientID: P2, status: 'no', rejectionReason: 'malade' },
      ],
    })
    expect(res.statusCode).toBe(200)

    const rows = await notifs('ide1@t.fr', 'ABSENT')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.payload).toMatchObject({ patientId: P1 })
    await new Promise((r) => setTimeout(r, 400))
    expect(
      await testDb.notification.count({
        where: { userId: ids['ide1@t.fr'], type: 'ABSENT' },
      }),
    ).toBe(1)
  })

  it('changement d horaire du rendez-vous : modifie, avec avant et apres', async () => {
    const res = await patchAppointment(appointmentId, {
      startDate: '2026-11-03T10:00:00.000Z',
      endDate: '2026-11-03T11:00:00.000Z',
    })
    expect(res.statusCode).toBe(200)

    const [n] = await notifs('ide1@t.fr', 'APPOINTMENT_MOVED')
    expect(n?.payload).toMatchObject({
      before: { startDate: expect.any(String), locationName: 'Bureau 2' },
      after: { startDate: '2026-11-03T10:00:00.000Z' },
    })
  })

  it('suppression : annulation qui porte encore le theme et les patients', async () => {
    const res = await t.app.inject({
      method: 'DELETE',
      url: tenantUrl(E, A, `/appointment/${autreRdv}`),
      cookies: coordC,
    })
    expect(res.statusCode).toBe(204)

    const [n] = await notifs('ide1@t.fr', 'APPOINTMENT_CANCELLED')
    expect(n?.payload).toMatchObject({
      appointmentId: autreRdv,
      thematicName: 'Alimentation',
      patients: [{ name: 'DUBOIS Marie' }],
    })
  })

  it('preferences : evenement decoche ou service decoche, rien', async () => {
    await testDb.user.update({
      where: { id: ids['ide2@t.fr'] },
      data: { notificationPrefs: { app: { added: false } } },
    })

    const res = await patchAppointment(troisiemeRdv, {
      appointmentPatients: [{ patientID: P3 }],
    })
    expect(res.statusCode).toBe(200)

    expect(
      await comptePourRdv('ide1@t.fr', 'PATIENT_ADDED', troisiemeRdv, 1),
    ).toBeGreaterThanOrEqual(1)
    expect(
      await comptePourRdv('ide2@t.fr', 'PATIENT_ADDED', troisiemeRdv, 0),
    ).toBe(0)

    // Service decoche : ide1 ne suit (en preference) qu'un autre service, rien ne doit partir.
    const autreService = (await createService(E, 'Autre service')).id
    await testDb.user.update({
      where: { id: ids['ide1@t.fr'] },
      data: { notificationPrefs: { services: [autreService] } },
    })
    const slot4 = await nouveauCreneau(
      '2026-11-05T09:00:00Z',
      '2026-11-05T09:30:00Z',
    )
    const quatriemeRdv = (
      await testDb.appointment.create({
        data: {
          startDate: new Date('2026-11-05T09:00:00Z'),
          endDate: new Date('2026-11-05T09:30:00Z'),
          establishmentId: E,
          serviceId: A,
          slotID: slot4.id,
        },
      })
    ).id
    const P6 = (
      await testDb.patient.create({
        data: {
          firstName: 'Lea',
          lastName: 'PETIT',
          establishmentId: E,
          createDate: new Date(),
        },
      })
    ).id
    const res2 = await patchAppointment(quatriemeRdv, {
      appointmentPatients: [{ patientID: P6 }],
    })
    expect(res2.statusCode).toBe(200)
    expect(
      await comptePourRdv('ide1@t.fr', 'PATIENT_ADDED', quatriemeRdv, 0),
    ).toBe(0)

    await testDb.user.update({
      where: { id: ids['ide1@t.fr'] },
      data: { notificationPrefs: {} },
    })
  })

  it('une erreur d ecriture du dispatcher n echoue pas la mise a jour, le changement persiste', async () => {
    const repo = t.instances.notificationRepository
    const original = repo.createMany.bind(repo)
    repo.createMany = () => Promise.reject(new Error('panne'))

    const res = await patchAppointment(appointmentId, {
      appointmentPatients: [{ id: ap1, patientID: P1 }, { patientID: P4 }],
    })

    repo.createMany = original
    expect(res.statusCode).toBe(200)
    const persiste = await testDb.appointmentPatient.findFirst({
      where: { appointmentId, patientId: P4 },
    })
    expect(persiste).not.toBeNull()
  })

  it('une erreur de lecture du contexte n echoue pas la suppression, le rendez-vous disparait', async () => {
    const slot6 = await nouveauCreneau(
      '2026-11-07T09:00:00Z',
      '2026-11-07T09:30:00Z',
    )
    const cinquiemeRdv = (
      await testDb.appointment.create({
        data: {
          startDate: new Date('2026-11-07T09:00:00Z'),
          endDate: new Date('2026-11-07T09:30:00Z'),
          establishmentId: E,
          serviceId: A,
          slotID: slot6.id,
        },
      })
    ).id
    const P7 = (
      await testDb.patient.create({
        data: {
          firstName: 'Tom',
          lastName: 'FABRE',
          establishmentId: E,
          createDate: new Date(),
        },
      })
    ).id
    await testDb.appointmentPatient.create({
      data: {
        establishmentId: E,
        serviceId: A,
        appointmentId: cinquiemeRdv,
        patientId: P7,
      },
    })

    const ctx = t.instances.notificationContextRepository
    const original = ctx.sessions.bind(ctx)
    ctx.sessions = () => Promise.reject(new Error('panne'))

    const res = await t.app.inject({
      method: 'DELETE',
      url: tenantUrl(E, A, `/appointment/${cinquiemeRdv}`),
      cookies: coordC,
    })

    ctx.sessions = original
    expect(res.statusCode).toBe(204)
    expect(
      await testDb.appointment.findUnique({ where: { id: cinquiemeRdv } }),
    ).toBeNull()
  })
})
