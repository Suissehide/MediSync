import { NotificationType } from '../../../generated/enums'
import {
  digestMail,
  notificationLine,
  notificationMail,
  notificationSubject,
} from '../../../main/infra/mail/notification-templates'

const FRONT_URL = 'https://medisync.test'
const START = new Date('2026-10-22T09:00:00.000Z') // jeu. 22/10 à 09:00
const AFTER = new Date('2026-10-23T10:00:00.000Z') // ven. 23/10 à 10:00

const TYPES = Object.values(NotificationType)

// Un payload par type, qui porte a la fois des champs utiles et les donnees de sante interdites.
const PIEGE: Record<string, Record<string, unknown>> = {
  REMINDER: {
    startDate: START,
    locationName: 'Bureau 2',
    thematicName: 'Diagnostic éducatif cardio',
  },
  PATIENT_ADDED: {
    startDate: START,
    firstStartDate: START,
    count: 1,
    patientId: 'p1',
    patientName: 'DUBOIS Marie',
    thematicName: 'Diagnostic éducatif cardio',
  },
  APPOINTMENT_MOVED: {
    before: { startDate: START, locationName: 'Bureau 1' },
    after: { startDate: AFTER, locationName: 'Bureau 2' },
  },
  APPOINTMENT_CANCELLED: {
    startDate: START,
    patients: [{ id: 'p1', name: 'DUBOIS Marie' }],
  },
  ABSENT: { startDate: START, patientId: 'p1', patientName: 'DUBOIS Marie' },
  SLOT_ALMOST_FULL: {
    startDate: START,
    thematicName: 'Diagnostic éducatif cardio',
  },
  DIAGNOSTIC_DUE: {
    entryDate: '2026-10-22',
    patientId: 'p1',
    patientName: 'DUBOIS Marie',
  },
  PATHWAY_END: {
    patientId: 'p1',
    patientName: 'DUBOIS Marie',
    pathwayId: 'pw1',
    lastDate: START,
  },
  TASK_DUE: {
    taskId: 't1',
    text: 'Rappeler DUBOIS Marie',
    dueDate: '2026-10-22',
  },
  MENTION: {
    taskId: 't1',
    authorId: 'u1',
    text: 'Rappeler DUBOIS Marie',
    actorName: 'Camille Durand',
  },
}

describe('notification-templates', () => {
  it.each(TYPES)(
    '%s : aucune donnee de sante, ni dans le texte ni dans le HTML',
    (type) => {
      const mail = notificationMail(
        'a@t.fr',
        { type, payload: PIEGE[type] as Record<string, unknown> },
        FRONT_URL,
      )
      for (const part of [mail.subject, mail.text, mail.html]) {
        expect(part).not.toContain('DUBOIS')
        expect(part).not.toContain('Marie')
        expect(part).not.toContain('Diagnostic éducatif cardio')
        expect(part).not.toContain('Rappeler')
      }
      expect(mail.text).toContain(FRONT_URL)
    },
  )

  it('REMINDER : phrase avec salle si connue', () => {
    expect(
      notificationLine({
        type: 'REMINDER',
        payload: { startDate: START, locationName: 'Bureau 2' },
      }),
    ).toBe('Rappel : vous avez une séance le jeu. 22/10 à 09:00, Bureau 2.')
  })

  it('REMINDER : phrase sans salle inconnue', () => {
    expect(
      notificationLine({ type: 'REMINDER', payload: { startDate: START } }),
    ).toBe('Rappel : vous avez une séance le jeu. 22/10 à 09:00.')
  })

  it('PATIENT_ADDED : une seule seance', () => {
    expect(
      notificationLine({
        type: 'PATIENT_ADDED',
        payload: { firstStartDate: START, count: 1 },
      }),
    ).toBe('Un patient a été ajouté à votre séance du jeu. 22/10 à 09:00.')
  })

  it('PATIENT_ADDED : plusieurs seances', () => {
    expect(
      notificationLine({
        type: 'PATIENT_ADDED',
        payload: { firstStartDate: START, count: 3 },
      }),
    ).toBe(
      'Un patient a été ajouté à 3 de vos séances, la première le jeu. 22/10 à 09:00.',
    )
  })

  it('APPOINTMENT_MOVED : changement de date', () => {
    expect(
      notificationLine({
        type: 'APPOINTMENT_MOVED',
        payload: {
          before: { startDate: START, locationName: 'Bureau 1' },
          after: { startDate: AFTER, locationName: 'Bureau 1' },
        },
      }),
    ).toBe(
      'Votre séance du jeu. 22/10 à 09:00 est déplacée au ven. 23/10 à 10:00.',
    )
  })

  it('APPOINTMENT_MOVED : changement de salle seule', () => {
    expect(
      notificationLine({
        type: 'APPOINTMENT_MOVED',
        payload: {
          before: { startDate: START, locationName: 'Bureau 1' },
          after: { startDate: START, locationName: 'Bureau 2' },
        },
      }),
    ).toBe('Votre séance du jeu. 22/10 à 09:00 change de salle : Bureau 2.')
  })

  it('APPOINTMENT_CANCELLED', () => {
    expect(
      notificationLine({
        type: 'APPOINTMENT_CANCELLED',
        payload: { startDate: START },
      }),
    ).toBe('Votre séance du jeu. 22/10 à 09:00 est annulée.')
  })

  it('ABSENT', () => {
    expect(
      notificationLine({ type: 'ABSENT', payload: { startDate: START } }),
    ).toBe(
      'Un patient était absent à votre séance du jeu. 22/10 à 09:00, sans justification.',
    )
  })

  it('SLOT_ALMOST_FULL', () => {
    expect(
      notificationLine({
        type: 'SLOT_ALMOST_FULL',
        payload: { startDate: START },
      }),
    ).toBe("Il ne reste qu'une place sur votre séance du jeu. 22/10 à 09:00.")
  })

  it("DIAGNOSTIC_DUE : date d'entree, sans heure", () => {
    expect(
      notificationLine({
        type: 'DIAGNOSTIC_DUE',
        payload: { entryDate: '2026-10-22' },
      }),
    ).toBe(
      'Un diagnostic éducatif est à réaliser pour un patient inclus le jeu. 22/10.',
    )
  })

  it('PATHWAY_END : phrase fixe, aucun champ lu', () => {
    expect(notificationLine({ type: 'PATHWAY_END', payload: {} })).toBe(
      'Un patient a terminé son parcours : bilan de fin à réaliser.',
    )
  })

  it('TASK_DUE : phrase fixe, aucun champ lu', () => {
    expect(notificationLine({ type: 'TASK_DUE', payload: {} })).toBe(
      "Une de vos tâches arrive à échéance aujourd'hui.",
    )
  })

  it('MENTION : nom du collegue mentionnant', () => {
    expect(
      notificationLine({
        type: 'MENTION',
        payload: { actorName: 'Camille Durand' },
      }),
    ).toBe('Camille Durand vous a mentionné dans une tâche.')
  })

  it.each(TYPES)('%s : le sujet correspond au type', (type) => {
    expect(notificationSubject(type)).toMatch(/^MediSync : /)
  })

  it('notificationMail : lien et pied presents', () => {
    const mail = notificationMail(
      'a@t.fr',
      { type: 'REMINDER', payload: { startDate: START } },
      FRONT_URL,
    )
    expect(mail.subject).toBe('MediSync : rappel de séance')
    expect(mail.text).toContain(FRONT_URL)
    expect(mail.text).toContain(
      'Vous recevez cet e-mail selon vos préférences de notification.',
    )
    expect(mail.html).toContain(FRONT_URL)
  })

  it('digestMail : une ligne par notification, objet avec le jour', () => {
    const mail = digestMail(
      'a@t.fr',
      [
        {
          type: 'REMINDER',
          payload: { startDate: START, locationName: 'Bureau 2' },
        },
        { type: 'ABSENT', payload: { startDate: AFTER } },
      ],
      START,
      FRONT_URL,
    )
    expect(mail.subject).toBe('MediSync : vos notifications du jeu. 22/10')
    expect(mail.text).toContain(
      'Rappel : vous avez une séance le jeu. 22/10 à 09:00, Bureau 2.',
    )
    expect(mail.text).toContain(
      'Un patient était absent à votre séance du ven. 23/10 à 10:00, sans justification.',
    )
    expect(mail.text).toContain(FRONT_URL)
  })
})
