import type { Prisma } from '../../generated/client'
import type { NotificationType } from '../../generated/enums'
import type { Mail } from '../../main/types/infra/mail/mailer.interface'
import { DEFAULT_PREFS, presetMail } from '../../main/utils/notification-prefs'
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
} from './setup/fixtures'

// Heures de Paris en UTC : fin octobre = UTC+1, 07:00 Paris = 06:00Z.
const PARIS_0659 = '2026-10-29T05:59:00.000Z'
const PARIS_0700 = '2026-10-29T06:00:00.000Z'
const PARIS_0701 = '2026-10-29T06:01:00.000Z'
const CREATED_BEFORE_7 = '2026-10-29T05:30:00.000Z'
const CREATED_AFTER_7 = '2026-10-29T06:30:00.000Z'

describe('NotificationMailer', () => {
  let t: TestApp
  let sent: { kind: string; mail: Mail }[]
  let E: string
  let S: string

  const runOnceAt = (iso: string) =>
    t.instances.tenantContext.runAsSystem(() =>
      t.instances.notificationMailer.runOnce(new Date(iso)),
    )

  const setPrefs = (userId: string, prefs: Record<string, unknown>) =>
    testDb.user.update({
      where: { id: userId },
      data: { notificationPrefs: prefs },
    })

  const mailStateOf = (notificationId: string) =>
    testDb.notification
      .findUniqueOrThrow({
        where: { id_serviceId: { id: notificationId, serviceId: S } },
      })
      .then((n) => n.mailState)

  const createNotification = (data: {
    userId: string
    type: NotificationType
    payload: Record<string, unknown>
    createdAt?: string
    readAt?: string
  }) =>
    testDb.notification.create({
      data: {
        establishmentId: E,
        serviceId: S,
        userId: data.userId,
        type: data.type,
        payload: data.payload as Prisma.InputJsonValue,
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        readAt: data.readAt ? new Date(data.readAt) : null,
      },
    })

  beforeAll(async () => {
    t = await buildTestApp()
    jest.spyOn(t.instances.mailer, 'send').mockImplementation((kind, mail) => {
      sent.push({ kind, mail })
    })
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    sent = []
    await truncateAll()
    const est = await createEstablishment('Clinique des Mails')
    E = est.id
    S = (await createService(E, 'Service mails')).id
  })

  it('aucune preference : aucun e-mail, notification passee a SKIPPED', async () => {
    const user = await createUser({ email: 'sans-pref@m.fr' })
    const n = await createNotification({
      userId: user.id,
      type: 'REMINDER',
      payload: { startDate: CREATED_BEFORE_7 },
    })
    expect(DEFAULT_PREFS.mail.reminder).toBe(false)

    const result = await runOnceAt(PARIS_0700)

    expect(sent).toHaveLength(0)
    expect(result.sent).toBe(0)
    expect(await mailStateOf(n.id)).toBe('SKIPPED')
  })

  it('Essentiel + digest now : rappel et mention envoyes, absence non', async () => {
    const auteur = await createUser({
      email: 'auteur@m.fr',
      firstName: 'Camille',
      lastName: 'Dupont',
    })
    const user = await createUser({ email: 'essentiel@m.fr' })
    await setPrefs(user.id, {
      level: 'essential',
      services: null,
      app: {},
      mail: presetMail('essential'),
      reminderDelay: 'eve',
      digest: 'now',
    })

    const reminder = await createNotification({
      userId: user.id,
      type: 'REMINDER',
      payload: { startDate: CREATED_BEFORE_7, locationName: 'Salle 2' },
    })
    const mention = await createNotification({
      userId: user.id,
      type: 'MENTION',
      payload: {
        taskId: 't1',
        authorId: auteur.id,
        text: 'Patient Jean Dupont a voir',
      },
    })
    const absent = await createNotification({
      userId: user.id,
      type: 'ABSENT',
      payload: { startDate: CREATED_BEFORE_7, patientName: 'Jean Dupont' },
    })

    const result = await runOnceAt(PARIS_0700)

    expect(sent).toHaveLength(2)
    expect(sent.every((m) => m.kind === 'notification')).toBe(true)
    expect(sent.every((m) => m.mail.to === 'essentiel@m.fr')).toBe(true)
    expect(await mailStateOf(reminder.id)).toBe('SENT')
    expect(await mailStateOf(mention.id)).toBe('SENT')
    expect(await mailStateOf(absent.id)).toBe('SKIPPED')
    expect(result.sent).toBe(2)

    const mentionMail = sent.find((m) => m.mail.subject.includes('mention'))
    expect(mentionMail?.mail.text).toContain('Camille Dupont')
    expect(
      `${mentionMail?.mail.subject}${mentionMail?.mail.text}${mentionMail?.mail.html}`,
    ).not.toContain('Jean Dupont')
  })

  it('mail coupe ou service non suivi : SKIPPED, aucun e-mail', async () => {
    const other = (await createService(E, 'Autre service')).id
    const userMailOff = await createUser({ email: 'mail-off@m.fr' })
    await setPrefs(userMailOff.id, {
      level: 'custom',
      services: null,
      app: {},
      mail: { ...presetMail('all'), reminder: false },
      reminderDelay: 'eve',
      digest: 'now',
    })
    const userAutreService = await createUser({
      email: 'autre-service@m.fr',
      memberships: [
        {
          establishmentId: E,
          services: [{ serviceId: other, role: 'INTERVENANT' }],
        },
      ],
    })
    await setPrefs(userAutreService.id, {
      level: 'all',
      services: [other],
      app: {},
      mail: presetMail('all'),
      reminderDelay: 'eve',
      digest: 'now',
    })

    const n1 = await createNotification({
      userId: userMailOff.id,
      type: 'REMINDER',
      payload: { startDate: CREATED_BEFORE_7 },
    })
    const n2 = await createNotification({
      userId: userAutreService.id,
      type: 'REMINDER',
      payload: { startDate: CREATED_BEFORE_7 },
    })

    await runOnceAt(PARIS_0700)

    expect(sent).toHaveLength(0)
    expect(await mailStateOf(n1.id)).toBe('SKIPPED')
    expect(await mailStateOf(n2.id)).toBe('SKIPPED')
  })

  it('second passage : aucun e-mail rejoue', async () => {
    const user = await createUser({ email: 'tout@m.fr' })
    await setPrefs(user.id, {
      level: 'all',
      services: null,
      app: {},
      mail: presetMail('all'),
      reminderDelay: 'eve',
      digest: 'now',
    })
    await createNotification({
      userId: user.id,
      type: 'REMINDER',
      payload: { startDate: CREATED_BEFORE_7 },
    })

    await runOnceAt(PARIS_0700)
    expect(sent).toHaveLength(1)
    await runOnceAt(PARIS_0701)
    expect(sent).toHaveLength(1)
  })

  it('notification deja SKIPPED (migration) : jamais envoyee', async () => {
    const user = await createUser({ email: 'migre@m.fr' })
    await setPrefs(user.id, {
      level: 'all',
      services: null,
      app: {},
      mail: presetMail('all'),
      reminderDelay: 'eve',
      digest: 'now',
    })
    const n = await createNotification({
      userId: user.id,
      type: 'REMINDER',
      payload: { startDate: CREATED_BEFORE_7 },
    })
    await testDb.notification.update({
      where: { id_serviceId: { id: n.id, serviceId: S } },
      data: { mailState: 'SKIPPED' },
    })

    await runOnceAt(PARIS_0700)

    expect(sent).toHaveLength(0)
    expect(await mailStateOf(n.id)).toBe('SKIPPED')
  })

  it('digest daily : rien avant 7h sauf le rappel, un seul resume a 7h puis 7h01, lue exclue, 7h30 attend', async () => {
    const user = await createUser({ email: 'daily@m.fr' })
    await setPrefs(user.id, {
      level: 'all',
      services: null,
      app: {},
      mail: presetMail('all'),
      reminderDelay: 'eve',
      digest: 'daily',
    })
    const reminder = await createNotification({
      userId: user.id,
      type: 'REMINDER',
      payload: { startDate: CREATED_BEFORE_7 },
      createdAt: CREATED_BEFORE_7,
    })
    const unread = await createNotification({
      userId: user.id,
      type: 'PATIENT_ADDED',
      payload: { firstStartDate: CREATED_BEFORE_7, count: 1 },
      createdAt: CREATED_BEFORE_7,
    })
    const read = await createNotification({
      userId: user.id,
      type: 'SLOT_ALMOST_FULL',
      payload: { startDate: CREATED_BEFORE_7 },
      createdAt: CREATED_BEFORE_7,
      readAt: CREATED_BEFORE_7,
    })
    const tard = await createNotification({
      userId: user.id,
      type: 'TASK_DUE',
      payload: {},
      createdAt: CREATED_AFTER_7,
    })

    await runOnceAt(PARIS_0659)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.kind).toBe('notification')
    expect(await mailStateOf(reminder.id)).toBe('SENT')
    expect(await mailStateOf(unread.id)).toBe('PENDING')

    await runOnceAt(PARIS_0700)
    expect(sent).toHaveLength(2)
    const digest = sent[1]
    expect(digest?.kind).toBe('notification-digest')
    expect(digest?.mail.to).toBe('daily@m.fr')
    expect(await mailStateOf(unread.id)).toBe('SENT')
    expect(await mailStateOf(read.id)).toBe('SKIPPED')
    expect(await mailStateOf(tard.id)).toBe('PENDING')

    await runOnceAt(PARIS_0701)
    expect(sent).toHaveLength(2)
  })

  it('compte desactive : SKIPPED, aucun e-mail', async () => {
    const user = await createUser({ email: 'desactive@m.fr' })
    await setPrefs(user.id, {
      level: 'all',
      services: null,
      app: {},
      mail: presetMail('all'),
      reminderDelay: 'eve',
      digest: 'now',
    })
    await testDb.user.update({
      where: { id: user.id },
      data: { deactivatedAt: new Date() },
    })
    const n = await createNotification({
      userId: user.id,
      type: 'REMINDER',
      payload: { startDate: CREATED_BEFORE_7 },
    })

    await runOnceAt(PARIS_0700)

    expect(sent).toHaveLength(0)
    expect(await mailStateOf(n.id)).toBe('SKIPPED')
  })

  it('aucun e-mail envoye ne contient de donnee de sante, sur tous les types', async () => {
    const auteur = await createUser({
      email: 'auteur2@m.fr',
      firstName: 'Lea',
      lastName: 'Martin',
    })
    const user = await createUser({ email: 'fuite@m.fr' })
    await setPrefs(user.id, {
      level: 'all',
      services: null,
      app: {},
      mail: presetMail('all'),
      reminderDelay: 'eve',
      digest: 'now',
    })
    const SECRET_PATIENT = 'Secret Patientnoire'
    const SECRET_THEMATIC = 'Secrete Thematique VIH'
    const SECRET_TASK = 'Texte de tache sur Secret Patientnoire'
    const notifications = await Promise.all([
      createNotification({
        userId: user.id,
        type: 'REMINDER',
        payload: {
          startDate: CREATED_BEFORE_7,
          thematicName: SECRET_THEMATIC,
          locationName: 'Salle A',
        },
      }),
      createNotification({
        userId: user.id,
        type: 'PATIENT_ADDED',
        payload: {
          firstStartDate: CREATED_BEFORE_7,
          count: 1,
          patientName: SECRET_PATIENT,
        },
      }),
      createNotification({
        userId: user.id,
        type: 'APPOINTMENT_MOVED',
        payload: {
          before: { startDate: CREATED_BEFORE_7 },
          after: { startDate: CREATED_AFTER_7, locationName: 'Salle B' },
          patientName: SECRET_PATIENT,
        },
      }),
      createNotification({
        userId: user.id,
        type: 'APPOINTMENT_CANCELLED',
        payload: { startDate: CREATED_BEFORE_7, patientName: SECRET_PATIENT },
      }),
      createNotification({
        userId: user.id,
        type: 'ABSENT',
        payload: { startDate: CREATED_BEFORE_7, patientName: SECRET_PATIENT },
      }),
      createNotification({
        userId: user.id,
        type: 'SLOT_ALMOST_FULL',
        payload: {
          startDate: CREATED_BEFORE_7,
          thematicName: SECRET_THEMATIC,
        },
      }),
      createNotification({
        userId: user.id,
        type: 'DIAGNOSTIC_DUE',
        payload: { entryDate: '2026-10-20', patientName: SECRET_PATIENT },
      }),
      createNotification({
        userId: user.id,
        type: 'PATHWAY_END',
        payload: { patientName: SECRET_PATIENT },
      }),
      createNotification({
        userId: user.id,
        type: 'TASK_DUE',
        payload: { text: SECRET_TASK },
      }),
      createNotification({
        userId: user.id,
        type: 'MENTION',
        payload: { taskId: 't2', authorId: auteur.id, text: SECRET_TASK },
      }),
    ])

    await runOnceAt(PARIS_0700)

    expect(sent.length).toBe(notifications.length)
    for (const { mail } of sent) {
      const blob = `${mail.subject}${mail.text}${mail.html}`
      expect(blob).not.toContain(SECRET_PATIENT)
      expect(blob).not.toContain(SECRET_THEMATIC)
      expect(blob).not.toContain(SECRET_TASK)
    }
    const mention = sent.find((m) => m.mail.subject.includes('mention'))
    expect(mention?.mail.text).toContain('Lea Martin')
  })

  it('concurrence : deux runOnce en parallele sur les memes lignes PENDING, chaque e-mail envoye une seule fois (immediat et resume)', async () => {
    const userImmediat = await createUser({ email: 'concurrent-immediat@m.fr' })
    await setPrefs(userImmediat.id, {
      level: 'all',
      services: null,
      app: {},
      mail: presetMail('all'),
      reminderDelay: 'eve',
      digest: 'now',
    })
    const nImmediat = await createNotification({
      userId: userImmediat.id,
      type: 'REMINDER',
      payload: { startDate: CREATED_BEFORE_7 },
    })

    const userDigest = await createUser({ email: 'concurrent-digest@m.fr' })
    await setPrefs(userDigest.id, {
      level: 'all',
      services: null,
      app: {},
      mail: presetMail('all'),
      reminderDelay: 'eve',
      digest: 'daily',
    })
    const nDigest = await createNotification({
      userId: userDigest.id,
      type: 'PATIENT_ADDED',
      payload: { firstStartDate: CREATED_BEFORE_7, count: 1 },
      createdAt: CREATED_BEFORE_7,
    })

    await Promise.all([runOnceAt(PARIS_0700), runOnceAt(PARIS_0700)])

    expect(
      sent.filter((m) => m.mail.to === 'concurrent-immediat@m.fr'),
    ).toHaveLength(1)
    expect(
      sent.filter((m) => m.mail.to === 'concurrent-digest@m.fr'),
    ).toHaveLength(1)
    expect(await mailStateOf(nImmediat.id)).toBe('SENT')
    expect(await mailStateOf(nDigest.id)).toBe('SENT')
  })

  it('echec du mailer apres capture : jamais rejoue au passage suivant', async () => {
    const user = await createUser({ email: 'echec-apres-capture@m.fr' })
    await setPrefs(user.id, {
      level: 'all',
      services: null,
      app: {},
      mail: presetMail('all'),
      reminderDelay: 'eve',
      digest: 'now',
    })
    const n = await createNotification({
      userId: user.id,
      type: 'REMINDER',
      payload: { startDate: CREATED_BEFORE_7 },
    })

    jest.spyOn(t.instances.mailer, 'send').mockImplementationOnce(() => {
      throw new Error('smtp down')
    })

    await runOnceAt(PARIS_0700)
    expect(sent).toHaveLength(0)
    expect(await mailStateOf(n.id)).toBe('SENT')

    await runOnceAt(PARIS_0701)
    expect(sent).toHaveLength(0)
    expect(await mailStateOf(n.id)).toBe('SENT')
  })
})
