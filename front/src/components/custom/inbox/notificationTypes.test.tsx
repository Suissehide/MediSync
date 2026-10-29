import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ServiceMember } from '@/types/serviceMember.ts'
import type { Notification, NotificationType } from '@/types/task.ts'
import {
  NOTIFICATION_TYPES,
  notificationTarget,
  notificationText,
  notificationTypeOf,
} from './notificationTypes.tsx'

const n = (
  type: NotificationType,
  payload: Record<string, unknown>,
): Notification => ({
  id: 'n1',
  type,
  payload,
  readAt: null,
  createdAt: '2026-10-20T08:00:00.000Z',
})

const claire: ServiceMember = {
  id: 'm1',
  role: 'INTERVENANT',
  soignantId: null,
  user: {
    id: 'u2',
    email: 'c@t.fr',
    firstName: 'Claire',
    lastName: 'Leroy',
    deactivatedAt: null,
    invitationStatus: null,
    invitationResendableAt: null,
  },
}

describe('NOTIFICATION_TYPES', () => {
  it('couvre les dix types, chacun avec icone, couleurs, libelle et lien', () => {
    const types: NotificationType[] = [
      'MENTION',
      'REMINDER',
      'PATIENT_ADDED',
      'APPOINTMENT_MOVED',
      'APPOINTMENT_CANCELLED',
      'ABSENT',
      'DIAGNOSTIC_DUE',
      'PATHWAY_END',
      'SLOT_ALMOST_FULL',
      'TASK_DUE',
    ]
    for (const type of types) {
      const entry = NOTIFICATION_TYPES[type]
      expect(entry.icon).toBeDefined()
      expect(entry.color).toMatch(/^#/)
      expect(entry.tint).toMatch(/^#/)
      expect(entry.kind).toBeTruthy()
      expect(entry.cta).toBeTruthy()
    }
  })

  it('type inconnu : pastille neutre sans lien plutot qu un plantage', () => {
    const entry = notificationTypeOf('INCONNU' as NotificationType)
    expect(entry.kind).toBe('Notification')
    expect(entry.cta).toBe('')
    expect(entry.color).toMatch(/^#/)
    expect(entry.tint).toMatch(/^#/)
    expect(() =>
      notificationText(n('INCONNU' as NotificationType, {}), []),
    ).not.toThrow()
    expect(
      notificationText(n('INCONNU' as NotificationType, {}), []),
    ).toBeNull()
    expect(() =>
      notificationTarget(n('INCONNU' as NotificationType, {})),
    ).not.toThrow()
  })
})

describe('notificationText', () => {
  it('patient ajoute, seul', () => {
    render(
      notificationText(
        n('PATIENT_ADDED', {
          patientName: 'BERNARD Jean',
          thematicName: 'Alimentation',
          count: 1,
          startDate: '2026-10-22T07:00:00.000Z',
          actorId: 'u2',
        }),
        [claire],
      ),
    )
    expect(screen.getByText('BERNARD Jean').tagName).toBe('B')
    expect(screen.getByText('Alimentation').tagName).toBe('B')
    expect(document.body.textContent).toContain('a été ajouté à votre séance')
  })

  it('patient ajoute, regroupe', () => {
    render(
      notificationText(
        n('PATIENT_ADDED', {
          patientName: 'BERNARD Jean',
          thematicName: 'Alimentation',
          count: 6,
          firstStartDate: '2026-10-22T07:00:00.000Z',
          startDate: '2026-10-22T07:00:00.000Z',
          actorId: 'u2',
        }),
        [claire],
      ),
    )
    expect(screen.getByText('BERNARD Jean').tagName).toBe('B')
    expect(document.body.textContent).toContain('à 6 de vos séances')
  })

  it('rappel', () => {
    render(
      notificationText(
        n('REMINDER', {
          startDate: '2026-10-22T07:00:00.000Z',
          thematicName: 'Alimentation',
          locationName: 'Salle 1',
        }),
        [],
      ),
    )
    expect(screen.getByText('Alimentation').tagName).toBe('B')
    expect(document.body.textContent).toContain(', Salle 1')
  })

  it('rendez-vous deplace', () => {
    render(
      notificationText(
        n('APPOINTMENT_MOVED', {
          thematicName: 'Alimentation',
          before: { startDate: '2026-10-20T07:00:00.000Z' },
          after: { startDate: '2026-10-22T07:00:00.000Z' },
          actorId: 'u2',
        }),
        [],
      ),
    )
    expect(document.body.textContent).toContain('est')
    expect(document.body.textContent).toContain('déplacée au')
  })

  it('rendez-vous change de salle seulement', () => {
    render(
      notificationText(
        n('APPOINTMENT_MOVED', {
          thematicName: 'Alimentation',
          before: { startDate: '2026-10-22T07:00:00.000Z' },
          after: {
            startDate: '2026-10-22T07:00:00.000Z',
            locationName: 'Salle 2',
          },
          actorId: 'u2',
        }),
        [],
      ),
    )
    expect(document.body.textContent).toBe(
      'Alimentation du jeu. 22/10 à 07:00 change de salle : Salle 2',
    )
    expect(screen.getByText('Alimentation').tagName).toBe('B')
    expect(screen.getByText('Salle 2').tagName).toBe('B')
  })

  it('rendez-vous change de salle vers aucune salle', () => {
    render(
      notificationText(
        n('APPOINTMENT_MOVED', {
          thematicName: 'Alimentation',
          before: {
            startDate: '2026-10-22T07:00:00.000Z',
            locationName: 'Salle 1',
          },
          after: { startDate: '2026-10-22T07:00:00.000Z', locationName: null },
        }),
        [],
      ),
    )
    expect(document.body.textContent).toContain(
      'change de salle : salle non précisée',
    )
  })

  it('rendez-vous deplace et change de salle : les deux sont dits', () => {
    render(
      notificationText(
        n('APPOINTMENT_MOVED', {
          thematicName: 'Alimentation',
          before: {
            startDate: '2026-10-20T07:00:00.000Z',
            locationName: 'Salle 1',
          },
          after: {
            startDate: '2026-10-22T07:00:00.000Z',
            locationName: 'Salle 2',
          },
        }),
        [],
      ),
    )
    expect(document.body.textContent).toBe(
      'Alimentation du mar. 20/10 à 07:00 est déplacée au jeu. 22/10 à 07:00, salle Salle 2',
    )
  })

  it('rendez-vous deplace sans changement de salle : la salle n est pas citee', () => {
    render(
      notificationText(
        n('APPOINTMENT_MOVED', {
          thematicName: 'Alimentation',
          before: {
            startDate: '2026-10-20T07:00:00.000Z',
            locationName: 'Salle 1',
          },
          after: {
            startDate: '2026-10-22T07:00:00.000Z',
            locationName: 'Salle 1',
          },
        }),
        [],
      ),
    )
    expect(document.body.textContent).not.toContain('salle')
  })

  it('sans thematique : « séance » plutot qu un gras vide', () => {
    const sansTheme = (type: NotificationType) => {
      const { container, unmount } = render(
        notificationText(
          n(type, {
            patientName: 'BERNARD Jean',
            thematicName: null,
            count: 1,
            startDate: '2026-10-22T07:00:00.000Z',
            before: { startDate: '2026-10-22T07:00:00.000Z' },
            after: { startDate: '2026-10-22T07:00:00.000Z' },
          }),
          [],
        ),
      )
      const bolds = [...container.querySelectorAll('b')].map(
        (b) => b.textContent,
      )
      const text = container.textContent
      unmount()
      return { bolds, text }
    }
    for (const type of [
      'REMINDER',
      'APPOINTMENT_MOVED',
      'APPOINTMENT_CANCELLED',
      'ABSENT',
      'SLOT_ALMOST_FULL',
    ] as NotificationType[]) {
      const { bolds } = sansTheme(type)
      expect(bolds).not.toContain('')
      expect(bolds.some((b) => b?.toLowerCase() === 'séance')).toBe(true)
    }
    const added = sansTheme('PATIENT_ADDED')
    expect(added.bolds).toEqual(['BERNARD Jean'])
    expect(added.text).toContain('à votre séance du')
  })

  it('rendez-vous annule', () => {
    render(
      notificationText(
        n('APPOINTMENT_CANCELLED', {
          thematicName: 'Alimentation',
          startDate: '2026-10-22T07:00:00.000Z',
          actorId: 'u2',
        }),
        [],
      ),
    )
    expect(document.body.textContent).toContain('est annulée')
  })

  it('absence non justifiee', () => {
    render(
      notificationText(
        n('ABSENT', {
          patientName: 'BERNARD Jean',
          thematicName: 'Alimentation',
          startDate: '2026-10-22T07:00:00.000Z',
          actorId: 'u2',
        }),
        [],
      ),
    )
    expect(document.body.textContent).toContain('sans justification')
  })

  it('creneau presque complet', () => {
    render(
      notificationText(
        n('SLOT_ALMOST_FULL', {
          thematicName: 'Alimentation',
          startDate: '2026-10-22T07:00:00.000Z',
        }),
        [],
      ),
    )
    expect(document.body.textContent).toContain("Plus qu'une place")
  })

  it('diagnostic a realiser', () => {
    render(
      notificationText(
        n('DIAGNOSTIC_DUE', {
          patientName: 'BERNARD Jean',
          entryDate: '2026-10-08T00:00:00.000Z',
        }),
        [],
      ),
    )
    expect(document.body.textContent).toContain('Diagnostic éducatif')
  })

  it('fin de parcours', () => {
    render(
      notificationText(
        n('PATHWAY_END', {
          patientName: 'BERNARD Jean',
          pathwayId: 'pw1',
          lastDate: '2026-10-19T00:00:00.000Z',
        }),
        [],
      ),
    )
    expect(document.body.textContent).toContain('Bilan de fin à réaliser')
  })

  it('tache a echeance', () => {
    render(
      notificationText(
        n('TASK_DUE', { taskId: 't1', text: 'Appeler le labo' }),
        [],
      ),
    )
    expect(document.body.textContent).toContain(
      "Échéance aujourd'hui : Appeler le labo",
    )
  })

  it('mention, inchange', () => {
    render(
      notificationText(
        n('MENTION', { taskId: 't1', authorId: 'u2', text: 'Verifier' }),
        [claire],
      ),
    )
    expect(screen.getByText('Claire Leroy').tagName).toBe('B')
    expect(document.body.textContent).toContain(
      'vous a mentionné dans une tâche',
    )
  })
})

describe('notificationTarget', () => {
  it('rendez-vous deplace -> agenda a la date apres', () => {
    expect(
      notificationTarget(
        n('APPOINTMENT_MOVED', {
          after: { startDate: '2026-10-22T07:00:00.000Z' },
        }),
      ),
    ).toEqual({ kind: 'agenda', date: '2026-10-22' })
  })

  it('absence -> fiche patient', () => {
    expect(notificationTarget(n('ABSENT', { patientId: 'p1' }))).toEqual({
      kind: 'patient',
      patientId: 'p1',
    })
  })

  it('mention -> tache', () => {
    expect(
      notificationTarget(
        n('MENTION', { taskId: 't1', authorId: 'u2', text: 'x' }),
      ),
    ).toEqual({ kind: 'task', taskId: 't1' })
  })

  it('echeance de tache -> tache', () => {
    expect(
      notificationTarget(n('TASK_DUE', { taskId: 't2', text: 'y' })),
    ).toEqual({ kind: 'task', taskId: 't2' })
  })

  it('diagnostic et fin de parcours -> fiche patient', () => {
    expect(
      notificationTarget(n('DIAGNOSTIC_DUE', { patientId: 'p2' })),
    ).toEqual({ kind: 'patient', patientId: 'p2' })
    expect(notificationTarget(n('PATHWAY_END', { patientId: 'p3' }))).toEqual({
      kind: 'patient',
      patientId: 'p3',
    })
  })

  it('patient ajoute, rappel, annulation, creneau presque complet -> agenda', () => {
    expect(
      notificationTarget(
        n('PATIENT_ADDED', { startDate: '2026-10-22T07:00:00.000Z' }),
      ),
    ).toEqual({ kind: 'agenda', date: '2026-10-22' })
    expect(
      notificationTarget(
        n('REMINDER', { startDate: '2026-10-23T07:00:00.000Z' }),
      ),
    ).toEqual({ kind: 'agenda', date: '2026-10-23' })
    expect(
      notificationTarget(
        n('APPOINTMENT_CANCELLED', { startDate: '2026-10-24T07:00:00.000Z' }),
      ),
    ).toEqual({ kind: 'agenda', date: '2026-10-24' })
    expect(
      notificationTarget(
        n('SLOT_ALMOST_FULL', { startDate: '2026-10-25T07:00:00.000Z' }),
      ),
    ).toEqual({ kind: 'agenda', date: '2026-10-25' })
  })
})
