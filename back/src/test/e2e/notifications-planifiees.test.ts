import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
} from './setup/fixtures'

// Planificateur (Task 5) : runOnce est appele directement, sous runAsSystem, avec une date
// fixe — contrairement au dispatcher (Task 3-4), l'ecriture est attendue (pas de tache de
// fond), donc aucune boucle d'attente n'est necessaire ici.
describe('NotificationScheduler', () => {
  let t: TestApp
  let E: string
  let A: string
  let S: string
  let SD: string
  let SB: string
  let ide1: string
  let ide2: string
  let ideLecture: string
  let ideOff: string
  let userSD: string
  let userSB: string

  const runOnceAt = (iso: string) =>
    t.instances.tenantContext.runAsSystem(() =>
      t.instances.notificationScheduler.runOnce(new Date(iso)),
    )

  const countFor = (
    userId: string,
    type: string,
    extra: Record<string, unknown> = {},
  ) => testDb.notification.count({ where: { userId, type, ...extra } })

  const patient = (firstName: string, lastName: string) =>
    testDb.patient.create({
      data: { firstName, lastName, establishmentId: E, createDate: new Date() },
    })

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()

    const est = await createEstablishment('E-PLANIF')
    E = est.id
    A = (await createService(E, 'S-PLANIF')).id

    S = (
      await testDb.soignant.create({
        data: { name: 'IDE', establishmentId: E, serviceId: A },
      })
    ).id
    SD = (
      await testDb.soignant.create({
        data: { name: 'IDE diagnostic', establishmentId: E, serviceId: A },
      })
    ).id
    SB = (
      await testDb.soignant.create({
        data: { name: 'IDE bilan', establishmentId: E, serviceId: A },
      })
    ).id

    const thDiag = await testDb.thematic.create({
      data: {
        name: 'Diagnostic educatif',
        role: 'DIAGNOSTIC_EDUCATIF',
        establishmentId: E,
        serviceId: A,
      },
    })
    const thBilan = await testDb.thematic.create({
      data: {
        name: 'Bilan de fin',
        role: 'BILAN_DE_FIN',
        establishmentId: E,
        serviceId: A,
      },
    })
    await testDb.soignantThematic.create({
      data: {
        soignantId: SD,
        thematicId: thDiag.id,
        establishmentId: E,
        serviceId: A,
      },
    })
    await testDb.soignantThematic.create({
      data: {
        soignantId: SB,
        thematicId: thBilan.id,
        establishmentId: E,
        serviceId: A,
      },
    })

    const membre = (role: 'INTERVENANT' | 'LECTURE', soignantId: string) => [
      { establishmentId: E, services: [{ serviceId: A, role, soignantId }] },
    ]

    ide1 = (
      await createUser({
        email: 'ide1@planif.fr',
        memberships: membre('INTERVENANT', S),
      })
    ).id
    ide2 = (
      await createUser({
        email: 'ide2@planif.fr',
        memberships: membre('INTERVENANT', S),
      })
    ).id
    await testDb.user.update({
      where: { id: ide2 },
      data: { notificationPrefs: { reminderDelay: '1h' } },
    })
    ideLecture = (
      await createUser({
        email: 'lecture@planif.fr',
        memberships: membre('LECTURE', S),
      })
    ).id
    ideOff = (
      await createUser({
        email: 'off@planif.fr',
        memberships: membre('INTERVENANT', S),
      })
    ).id
    await testDb.user.update({
      where: { id: ideOff },
      data: { deactivatedAt: new Date() },
    })
    userSD = (
      await createUser({
        email: 'sd@planif.fr',
        memberships: membre('INTERVENANT', SD),
      })
    ).id
    userSB = (
      await createUser({
        email: 'sb@planif.fr',
        memberships: membre('INTERVENANT', SB),
      })
    ).id
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  describe('rappels', () => {
    let appointmentId: string
    let dejaCommenceId: string

    beforeAll(async () => {
      const slotTemplate = await testDb.slotTemplate.create({
        data: {
          startTime: new Date('2026-11-05T09:00:00Z'),
          endTime: new Date('2026-11-05T09:30:00Z'),
          offsetDays: 0,
          isIndividual: true,
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
      const slot = await testDb.slot.create({
        data: {
          startDate: new Date('2026-11-05T09:00:00Z'),
          endDate: new Date('2026-11-05T09:30:00Z'),
          establishmentId: E,
          serviceId: A,
          slotTemplateID: slotTemplate.id,
        },
      })
      appointmentId = (
        await testDb.appointment.create({
          data: {
            startDate: new Date('2026-11-05T09:00:00Z'),
            endDate: new Date('2026-11-05T09:30:00Z'),
            establishmentId: E,
            serviceId: A,
            slotID: slot.id,
          },
        })
      ).id

      // Deja commence au moment du premier runOnce ci-dessous : jamais dans la fenetre [now, now+25h].
      const slotTemplate2 = await testDb.slotTemplate.create({
        data: {
          startTime: new Date('2026-11-04T08:00:00Z'),
          endTime: new Date('2026-11-04T08:30:00Z'),
          offsetDays: 0,
          isIndividual: true,
          color: '#fff',
          establishmentId: E,
          serviceId: A,
        },
      })
      await testDb.slotTemplateSoignant.create({
        data: {
          slotTemplateId: slotTemplate2.id,
          soignantId: S,
          serviceId: A,
          establishmentId: E,
        },
      })
      const slot2 = await testDb.slot.create({
        data: {
          startDate: new Date('2026-11-04T08:00:00Z'),
          endDate: new Date('2026-11-04T08:30:00Z'),
          establishmentId: E,
          serviceId: A,
          slotTemplateID: slotTemplate2.id,
        },
      })
      dejaCommenceId = (
        await testDb.appointment.create({
          data: {
            startDate: new Date('2026-11-04T08:00:00Z'),
            endDate: new Date('2026-11-04T08:30:00Z'),
            establishmentId: E,
            serviceId: A,
            slotID: slot2.id,
          },
        })
      ).id
    })

    it('rien avant 18h la veille (eve, delai par defaut)', async () => {
      await runOnceAt('2026-11-04T16:59:00.000Z')
      expect(
        await countFor(ide1, 'REMINDER', {
          payload: { path: ['appointmentId'], equals: appointmentId },
        }),
      ).toBe(0)
    })

    it('18h la veille : REMINDER pour ide1 (eve), rien pour ide2 (1h)', async () => {
      const res = await runOnceAt('2026-11-04T17:00:00.000Z')
      expect(res.created).toBeGreaterThanOrEqual(1)
      const rows = await testDb.notification.findMany({
        where: { userId: ide1, type: 'REMINDER' },
      })
      const row = rows.find(
        (r) =>
          (r.payload as { appointmentId?: string }).appointmentId ===
          appointmentId,
      )
      expect(row?.payload).toMatchObject({
        appointmentId,
        startDate: '2026-11-05T09:00:00.000Z',
      })
      expect(await countFor(ide2, 'REMINDER')).toBe(0)
      // Deja commence : jamais de rappel, quel que soit le passage.
      expect(
        await countFor(ide1, 'REMINDER', {
          payload: { path: ['appointmentId'], equals: dejaCommenceId },
        }),
      ).toBe(0)
      // LECTURE et compte desactive : jamais destinataires.
      expect(await countFor(ideLecture, 'REMINDER')).toBe(0)
      expect(await countFor(ideOff, 'REMINDER')).toBe(0)
    })

    it('un second passage a la meme heure ne duplique rien (idempotence)', async () => {
      const res = await runOnceAt('2026-11-04T17:00:00.000Z')
      expect(
        await testDb.notification.count({
          where: {
            userId: ide1,
            type: 'REMINDER',
            payload: { path: ['appointmentId'], equals: appointmentId },
          },
        }),
      ).toBe(1)
      expect(res).toBeDefined()
    })

    it('1h avant : REMINDER pour ide2', async () => {
      await runOnceAt('2026-11-05T08:00:00.000Z')
      expect(await countFor(ide2, 'REMINDER')).toBe(1)
      // ide1 toujours a un seul rappel pour ce rendez-vous.
      expect(
        await testDb.notification.count({
          where: {
            userId: ide1,
            type: 'REMINDER',
            payload: { path: ['appointmentId'], equals: appointmentId },
          },
        }),
      ).toBe(1)
    })

    it('cinq minutes plus tard : toujours un seul rappel par compte', async () => {
      await runOnceAt('2026-11-05T08:05:00.000Z')
      expect(await countFor(ide2, 'REMINDER')).toBe(1)
    })
  })

  describe('diagnostic educatif', () => {
    it('J+7 sans diagnostic : DIAGNOSTIC_DUE chez le compte de SD', async () => {
      const p = await patient('Paul', 'MARTIN')
      await testDb.patientServiceFile.create({
        data: {
          patientId: p.id,
          serviceId: A,
          establishmentId: E,
          entryDate: new Date('2026-10-01T00:00:00Z'),
        },
      })

      const res = await runOnceAt('2026-10-08T06:00:00.000Z')
      expect(res.created).toBeGreaterThanOrEqual(1)
      const rows = await testDb.notification.findMany({
        where: { userId: userSD, type: 'DIAGNOSTIC_DUE' },
      })
      expect(rows).toHaveLength(1)
      expect(rows[0]?.payload).toMatchObject({
        patientId: p.id,
        patientName: 'MARTIN Paul',
      })

      // Idempotence.
      await runOnceAt('2026-10-08T06:00:00.000Z')
      expect(
        await testDb.notification.count({
          where: { userId: userSD, type: 'DIAGNOSTIC_DUE' },
        }),
      ).toBe(1)
    })

    it('avec un diagnostic deja fait : rien', async () => {
      const p = await patient('Alice', 'DURAND')
      const file = await testDb.patientServiceFile.create({
        data: {
          patientId: p.id,
          serviceId: A,
          establishmentId: E,
          entryDate: new Date('2026-10-01T00:00:00Z'),
        },
      })
      await testDb.diagnosticEducatif.create({
        data: {
          patientId: p.id,
          serviceId: A,
          establishmentId: E,
          activeFields: [],
        },
      })

      await runOnceAt('2026-10-08T06:00:00.000Z')
      expect(
        await testDb.notification.count({
          where: {
            type: 'DIAGNOSTIC_DUE',
            payload: { path: ['patientId'], equals: p.id },
          },
        }),
      ).toBe(0)
      expect(file).toBeDefined()
    })

    it('entryDate vieille de 40 jours : hors fenetre de 30 jours, rien', async () => {
      const p = await patient('Jean', 'LEROY')
      await testDb.patientServiceFile.create({
        data: {
          patientId: p.id,
          serviceId: A,
          establishmentId: E,
          entryDate: new Date('2026-08-29T00:00:00Z'),
        },
      })

      await runOnceAt('2026-10-08T06:00:00.000Z')
      expect(
        await testDb.notification.count({
          where: {
            type: 'DIAGNOSTIC_DUE',
            payload: { path: ['patientId'], equals: p.id },
          },
        }),
      ).toBe(0)
    })
  })

  describe('fin de parcours', () => {
    const creerParcours = async (patientId: string) => {
      const pathway = await testDb.pathway.create({
        data: {
          startDate: new Date('2026-09-01'),
          establishmentId: E,
          serviceId: A,
        },
      })
      const slotTemplate = await testDb.slotTemplate.create({
        data: {
          startTime: new Date('2026-10-10T08:00:00Z'),
          endTime: new Date('2026-10-10T09:00:00Z'),
          offsetDays: 0,
          isIndividual: false,
          color: '#fff',
          establishmentId: E,
          serviceId: A,
        },
      })
      const slot = await testDb.slot.create({
        data: {
          startDate: new Date('2026-10-10T08:00:00Z'),
          endDate: new Date('2026-10-10T09:00:00Z'),
          pathwayID: pathway.id,
          establishmentId: E,
          serviceId: A,
          slotTemplateID: slotTemplate.id,
        },
      })
      const appointment = await testDb.appointment.create({
        data: {
          startDate: new Date('2026-10-10T08:00:00Z'),
          endDate: new Date('2026-10-10T09:00:00Z'),
          establishmentId: E,
          serviceId: A,
          slotID: slot.id,
        },
      })
      await testDb.appointmentPatient.create({
        data: {
          establishmentId: E,
          serviceId: A,
          appointmentId: appointment.id,
          patientId,
        },
      })
      return pathway.id
    }

    it('lendemain de la derniere seance, sans bilan de fin : PATHWAY_END chez le compte de SB', async () => {
      const p = await patient('Marc', 'PETIT')
      const pathwayId = await creerParcours(p.id)

      const res = await runOnceAt('2026-10-11T06:00:00.000Z')
      expect(res.created).toBeGreaterThanOrEqual(1)
      const rows = await testDb.notification.findMany({
        where: { userId: userSB, type: 'PATHWAY_END' },
      })
      const row = rows.find(
        (r) => (r.payload as { pathwayId?: string }).pathwayId === pathwayId,
      )
      expect(row?.payload).toMatchObject({
        patientId: p.id,
        patientName: 'PETIT Marc',
        pathwayId,
      })

      // Idempotence.
      await runOnceAt('2026-10-11T06:00:00.000Z')
      expect(
        await testDb.notification.count({
          where: {
            userId: userSB,
            type: 'PATHWAY_END',
            payload: { path: ['pathwayId'], equals: pathwayId },
          },
        }),
      ).toBe(1)
    })

    it('avec une seance de bilan de fin dans ce parcours : rien', async () => {
      const p = await patient('Sarah', 'ROUX')
      const pathwayId = await creerParcours(p.id)

      const thBilanSession = await testDb.thematic.create({
        data: {
          name: 'Bilan session',
          role: 'BILAN_DE_FIN',
          establishmentId: E,
          serviceId: A,
        },
      })
      const slotTemplate = await testDb.slotTemplate.create({
        data: {
          startTime: new Date('2026-10-15T08:00:00Z'),
          endTime: new Date('2026-10-15T09:00:00Z'),
          offsetDays: 0,
          isIndividual: false,
          color: '#fff',
          thematicId: thBilanSession.id,
          establishmentId: E,
          serviceId: A,
        },
      })
      const slot = await testDb.slot.create({
        data: {
          startDate: new Date('2026-10-15T08:00:00Z'),
          endDate: new Date('2026-10-15T09:00:00Z'),
          pathwayID: pathwayId,
          establishmentId: E,
          serviceId: A,
          slotTemplateID: slotTemplate.id,
        },
      })
      const appointment = await testDb.appointment.create({
        data: {
          startDate: new Date('2026-10-15T08:00:00Z'),
          endDate: new Date('2026-10-15T09:00:00Z'),
          establishmentId: E,
          serviceId: A,
          slotID: slot.id,
        },
      })
      await testDb.appointmentPatient.create({
        data: {
          establishmentId: E,
          serviceId: A,
          appointmentId: appointment.id,
          patientId: p.id,
        },
      })

      await runOnceAt('2026-10-11T06:00:00.000Z')
      expect(
        await testDb.notification.count({
          where: {
            type: 'PATHWAY_END',
            payload: { path: ['pathwayId'], equals: pathwayId },
          },
        }),
      ).toBe(0)
    })
  })

  describe('echeances de taches', () => {
    it('rien avant 7h Paris, TASK_DUE a partir de 7h, taguee sur une personne', async () => {
      const task = await testDb.task.create({
        data: {
          text: 'Appeler le patient',
          establishmentId: E,
          serviceId: A,
          dueDate: new Date('2026-10-21T00:00:00Z'),
          assignees: { create: [{ userId: ide1, establishmentId: E }] },
        },
      })

      await runOnceAt('2026-10-21T04:59:00.000Z')
      expect(await countFor(ide1, 'TASK_DUE')).toBe(0)

      const res = await runOnceAt('2026-10-21T05:00:00.000Z')
      expect(res.created).toBeGreaterThanOrEqual(1)
      const rows = await testDb.notification.findMany({
        where: { userId: ide1, type: 'TASK_DUE' },
      })
      expect(rows).toHaveLength(1)
      expect(rows[0]?.payload).toMatchObject({
        taskId: task.id,
        text: 'Appeler le patient',
      })

      // Idempotence.
      await runOnceAt('2026-10-21T05:00:00.000Z')
      expect(await countFor(ide1, 'TASK_DUE')).toBe(1)
    })

    it('tache terminee : rien', async () => {
      const task = await testDb.task.create({
        data: {
          text: 'Deja faite',
          establishmentId: E,
          serviceId: A,
          dueDate: new Date('2026-10-21T00:00:00Z'),
          doneAt: new Date(),
          assignees: { create: [{ userId: ide1, establishmentId: E }] },
        },
      })

      await runOnceAt('2026-10-21T05:00:00.000Z')
      expect(
        await testDb.notification.count({
          where: {
            type: 'TASK_DUE',
            payload: { path: ['taskId'], equals: task.id },
          },
        }),
      ).toBe(0)
    })

    it('taguee sur un metier : les comptes de ce metier', async () => {
      const task = await testDb.task.create({
        data: {
          text: 'Pour les IDE',
          establishmentId: E,
          serviceId: A,
          dueDate: new Date('2026-10-21T00:00:00Z'),
          soignants: { create: [{ soignantId: S, establishmentId: E }] },
        },
      })

      await runOnceAt('2026-10-21T05:00:00.000Z')
      const rows = await testDb.notification.findMany({
        where: {
          type: 'TASK_DUE',
          payload: { path: ['taskId'], equals: task.id },
        },
      })
      expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([ide1, ide2]))
    })
  })

  describe('preferences', () => {
    it('ide1 avec app.reminder = false : aucun rappel', async () => {
      const slotTemplate = await testDb.slotTemplate.create({
        data: {
          startTime: new Date('2026-11-20T09:00:00Z'),
          endTime: new Date('2026-11-20T09:30:00Z'),
          offsetDays: 0,
          isIndividual: true,
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
      const slot = await testDb.slot.create({
        data: {
          startDate: new Date('2026-11-20T09:00:00Z'),
          endDate: new Date('2026-11-20T09:30:00Z'),
          establishmentId: E,
          serviceId: A,
          slotTemplateID: slotTemplate.id,
        },
      })
      const appointment = await testDb.appointment.create({
        data: {
          startDate: new Date('2026-11-20T09:00:00Z'),
          endDate: new Date('2026-11-20T09:30:00Z'),
          establishmentId: E,
          serviceId: A,
          slotID: slot.id,
        },
      })

      await testDb.user.update({
        where: { id: ide1 },
        data: { notificationPrefs: { app: { reminder: false } } },
      })

      // La veille a 18h (delai par defaut 'eve').
      await runOnceAt('2026-11-19T17:00:00.000Z')
      expect(
        await testDb.notification.count({
          where: {
            userId: ide1,
            type: 'REMINDER',
            payload: { path: ['appointmentId'], equals: appointment.id },
          },
        }),
      ).toBe(0)

      await testDb.user.update({
        where: { id: ide1 },
        data: { notificationPrefs: {} },
      })
    })
  })

  describe('purge', () => {
    it('une notification de 31 jours est supprimee, une de 29 jours reste', async () => {
      const vieille = await testDb.notification.create({
        data: {
          establishmentId: E,
          serviceId: A,
          userId: ide1,
          type: 'MENTION',
          payload: {},
          createdAt: new Date(Date.now() - 31 * 86_400_000),
        },
      })
      const recente = await testDb.notification.create({
        data: {
          establishmentId: E,
          serviceId: A,
          userId: ide1,
          type: 'MENTION',
          payload: {},
          createdAt: new Date(Date.now() - 29 * 86_400_000),
        },
      })

      await runOnceAt(new Date().toISOString())

      expect(
        await testDb.notification.findUnique({ where: { id: vieille.id } }),
      ).toBeNull()
      expect(
        await testDb.notification.findUnique({ where: { id: recente.id } }),
      ).not.toBeNull()
    })
  })
})
