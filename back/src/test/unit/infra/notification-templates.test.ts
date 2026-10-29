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

// Piege unique, reutilise partout : si un gabarit l'interpole, un des quatre mots apparait.
const TRAP = {
  patientName: 'DUBOIS Marie',
  patients: [{ id: 'p', name: 'DUBOIS Marie' }],
  thematicName: 'Diagnostic éducatif cardio',
  text: 'Rappeler DUBOIS Marie',
}
const FORBIDDEN = ['DUBOIS', 'Marie', 'Diagnostic éducatif cardio', 'Rappeler']

// Champs utiles par type (ceux que la spec autorise a lire), le piege est ajoute a part.
const USEFUL: Record<string, Record<string, unknown>> = {
  REMINDER: { startDate: START, locationName: 'Bureau 2' },
  PATIENT_ADDED: { firstStartDate: START, count: 1 },
  APPOINTMENT_CANCELLED: { startDate: START },
  ABSENT: { startDate: START },
  SLOT_ALMOST_FULL: { startDate: START },
  DIAGNOSTIC_DUE: { entryDate: '2026-10-22' },
  PATHWAY_END: {},
  TASK_DUE: { dueDate: '2026-10-22' },
  MENTION: { actorName: 'Camille Durand' },
}

// Le piege est pose a la fois au niveau du payload et dans before/after pour APPOINTMENT_MOVED.
const piegeFor = (type: string): Record<string, unknown> => {
  if (type === 'APPOINTMENT_MOVED') {
    return {
      ...TRAP,
      before: { startDate: START, locationName: 'Bureau 1', ...TRAP },
      after: { startDate: AFTER, locationName: 'Bureau 2', ...TRAP },
    }
  }
  return { ...USEFUL[type], ...TRAP }
}

const assertNoLeak = (mail: {
  subject: string
  text: string
  html: string
}) => {
  for (const part of [mail.subject, mail.text, mail.html]) {
    for (const forbidden of FORBIDDEN) {
      expect(part).not.toContain(forbidden)
    }
  }
}

describe('notification-templates', () => {
  it.each(TYPES)(
    '%s : aucune donnee de sante, ni dans le texte ni dans le HTML',
    (type) => {
      const mail = notificationMail(
        'a@t.fr',
        { type, payload: piegeFor(type) },
        FRONT_URL,
      )
      assertNoLeak(mail)
      expect(mail.text).toContain(FRONT_URL)
    },
  )

  it("digest : aucune donnee de sante sur l'ensemble des types", () => {
    const items = TYPES.map((type) => ({ type, payload: piegeFor(type) }))
    const mail = digestMail('a@t.fr', items, START, FRONT_URL)
    assertNoLeak(mail)
    expect(mail.text).toContain(FRONT_URL)
  })

  it.each([
    ['REMINDER', 'MediSync : rappel de séance'],
    ['PATIENT_ADDED', 'MediSync : patient ajouté'],
    ['APPOINTMENT_MOVED', 'MediSync : séance modifiée'],
    ['APPOINTMENT_CANCELLED', 'MediSync : séance annulée'],
    ['ABSENT', 'MediSync : absence'],
    ['SLOT_ALMOST_FULL', 'MediSync : créneau presque complet'],
    ['DIAGNOSTIC_DUE', 'MediSync : diagnostic à réaliser'],
    ['PATHWAY_END', 'MediSync : fin de parcours'],
    ['TASK_DUE', 'MediSync : tâche à échéance'],
    ['MENTION', 'MediSync : mention dans une tâche'],
  ])('sujet verbatim de %s', (type, expected) => {
    expect(notificationSubject(type as (typeof TYPES)[number])).toBe(expected)
  })

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

  it('APPOINTMENT_MOVED : salle retiree (locationName vide) -> salle non precisee', () => {
    expect(
      notificationLine({
        type: 'APPOINTMENT_MOVED',
        payload: {
          before: { startDate: START, locationName: 'Bureau 1' },
          after: { startDate: START, locationName: null },
        },
      }),
    ).toBe(
      'Votre séance du jeu. 22/10 à 09:00 change de salle : salle non précisée.',
    )
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

  it('MENTION : sans actorName -> collegue generique', () => {
    expect(notificationLine({ type: 'MENTION', payload: {} })).toBe(
      'Un collègue vous a mentionné dans une tâche.',
    )
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

  describe('dates manquantes ou invalides : jamais de throw, jamais "Invalid"', () => {
    const NO_DATE_PAYLOAD: Record<string, Record<string, unknown>> = {
      REMINDER: { locationName: 'Bureau 2' },
      PATIENT_ADDED: { count: 1 },
      APPOINTMENT_MOVED: {
        before: { locationName: 'Bureau 1' },
        after: { locationName: 'Bureau 2' },
      },
      APPOINTMENT_CANCELLED: {},
      ABSENT: {},
      SLOT_ALMOST_FULL: {},
      DIAGNOSTIC_DUE: {},
      PATHWAY_END: {},
      TASK_DUE: {},
      MENTION: {},
    }

    it.each(TYPES)(
      '%s : aucun champ date -> pas d\'exception, pas "Invalid"',
      (type) => {
        let line = ''
        expect(() => {
          line = notificationLine({ type, payload: NO_DATE_PAYLOAD[type] })
        }).not.toThrow()
        expect(line).not.toContain('Invalid')
        expect(line.length).toBeGreaterThan(0)
      },
    )

    it('REMINDER : chaine de date invalide -> prochainement', () => {
      expect(
        notificationLine({
          type: 'REMINDER',
          payload: { startDate: 'pas-une-date' },
        }),
      ).toBe('Rappel : vous avez une séance prochainement.')
    })

    it("APPOINTMENT_MOVED : date manquante d'un seul cote -> pas de comparaison NaN, phrase neutre", () => {
      expect(
        notificationLine({
          type: 'APPOINTMENT_MOVED',
          payload: {
            before: { startDate: START, locationName: 'Bureau 1' },
            after: { locationName: 'Bureau 2' },
          },
        }),
      ).toBe('Votre séance est modifiée.')
    })

    it('APPOINTMENT_MOVED : les deux dates manquantes -> phrase neutre', () => {
      expect(
        notificationLine({
          type: 'APPOINTMENT_MOVED',
          payload: { before: {}, after: {} },
        }),
      ).toBe('Votre séance est modifiée.')
    })

    it("DIAGNOSTIC_DUE : entryDate manquante -> date d'entree omise", () => {
      expect(notificationLine({ type: 'DIAGNOSTIC_DUE', payload: {} })).toBe(
        'Un diagnostic éducatif est à réaliser pour un patient inclus.',
      )
    })

    it('digest : un item sans date ne fait pas echouer le resume', () => {
      expect(() =>
        digestMail(
          'a@t.fr',
          [
            { type: 'REMINDER', payload: { startDate: START } },
            { type: 'APPOINTMENT_CANCELLED', payload: {} },
          ],
          START,
          FRONT_URL,
        ),
      ).not.toThrow()
      const mail = digestMail(
        'a@t.fr',
        [
          { type: 'REMINDER', payload: { startDate: START } },
          { type: 'APPOINTMENT_CANCELLED', payload: {} },
        ],
        START,
        FRONT_URL,
      )
      expect(mail.text).not.toContain('Invalid')
      expect(mail.text).toContain('Votre séance prochainement est annulée.')
    })
  })
})
