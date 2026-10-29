import { describe, expect, it } from 'vitest'

import type { Slot } from '../types/slot.ts'
import {
  conflictWarning,
  describeConflict,
  labelConflicts,
} from './planningConflicts.ts'

const slot = (
  id: string,
  start: string,
  end: string,
  extra: Record<string, unknown> = {},
) =>
  ({
    id,
    startDate: `2026-04-01T${start}:00.000Z`,
    endDate: `2026-04-01T${end}:00.000Z`,
    locked: false,
    appointments: [],
    slotTemplate: {
      id: `tpl-${id}`,
      soignants: [],
      location: { id: 'loc-1', name: 'Salle Bleue' },
      thematic: 'Atelier diététique',
    },
    ...extra,
  }) as unknown as Slot

const patient = { id: 'p1', firstName: 'Jeanne', lastName: 'Martin' }
const rendezVous = (id: string, start: string) => ({
  id,
  startDate: `2026-04-01T${start}:00.000Z`,
  endDate: `2026-04-01T${start}:00.000Z`,
  appointmentPatients: [{ id: `ap-${id}`, patient }],
})

describe('describeConflict', () => {
  it('nomme l autre creneau pour une salle', () => {
    const slots = [slot('a', '09:00', '10:00'), slot('b', '09:30', '10:30')]
    const conflict = {
      type: 'salle' as const,
      slotIDs: ['a', 'b'],
      locationID: 'loc-1',
    }
    expect(describeConflict(conflict, 'a', slots)).toBe(
      'Salle Bleue déjà occupée 09:30–10:30 (Atelier diététique)',
    )
    expect(describeConflict(conflict, 'b', slots)).toBe(
      'Salle Bleue déjà occupée 09:00–10:00 (Atelier diététique)',
    )
  })

  it('donne l heure de l autre rendez-vous du patient', () => {
    const slots = [
      slot('a', '09:00', '10:00', {
        appointments: [rendezVous('r1', '09:00')],
      }),
      slot('b', '09:30', '11:00', {
        appointments: [rendezVous('r2', '09:30')],
      }),
    ]
    const conflict = {
      type: 'patient' as const,
      slotIDs: ['a', 'b'],
      appointmentIDs: ['r1', 'r2'],
      patientID: 'p1',
    }
    expect(describeConflict(conflict, 'a', slots)).toBe(
      'Martin Jeanne a déjà un rendez-vous à 09:30',
    )
  })

  it('signale deux rendez-vous du meme creneau', () => {
    const slots = [
      slot('a', '09:00', '11:00', {
        appointments: [rendezVous('r1', '09:00'), rendezVous('r2', '09:30')],
      }),
    ]
    const conflict = {
      type: 'patient' as const,
      slotIDs: ['a'],
      appointmentIDs: ['r1', 'r2'],
      patientID: 'p1',
    }
    expect(describeConflict(conflict, 'a', slots)).toBe(
      'Martin Jeanne a deux rendez-vous qui se chevauchent',
    )
  })

  it('compte les patients pour la capacite', () => {
    const conflict = {
      type: 'capacite' as const,
      slotIDs: ['a'],
      appointmentID: 'r1',
      capacity: 8,
      count: 9,
    }
    expect(describeConflict(conflict, 'a', [])).toBe('9 patients pour 8 places')
  })

  it('reste lisible quand l autre creneau n est pas charge', () => {
    const conflict = {
      type: 'salle' as const,
      slotIDs: ['a', 'x'],
      locationID: 'loc-1',
    }
    expect(describeConflict(conflict, 'a', [slot('a', '09:00', '10:00')])).toBe(
      'Salle Bleue déjà occupée',
    )
  })
})

describe('describeConflict sans creneau charge', () => {
  it('garde une phrase correcte quand la salle est inconnue', () => {
    const conflict = {
      type: 'salle' as const,
      slotIDs: ['a', 'b'],
      locationID: 'loc-1',
    }
    expect(describeConflict(conflict, 'a', [])).toBe('Salle déjà occupée')
  })
})

describe('labelConflicts', () => {
  it('range un libelle par creneau concerne', () => {
    const slots = [slot('a', '09:00', '10:00'), slot('b', '09:30', '10:30')]
    const labels = labelConflicts(
      [{ type: 'salle', slotIDs: ['a', 'b'], locationID: 'loc-1' }],
      slots,
    )
    expect(labels.get('a')).toEqual([
      'Salle Bleue déjà occupée 09:30–10:30 (Atelier diététique)',
    ])
    expect(labels.get('b')).toHaveLength(1)
  })
})

describe('conflictWarning', () => {
  it('resume les conflits pour le toast', () => {
    expect(
      conflictWarning([
        { type: 'salle', slotIDs: ['a', 'b'], locationID: 'loc-1' },
        {
          type: 'capacite',
          slotIDs: ['a'],
          appointmentID: 'r1',
          capacity: 1,
          count: 2,
        },
      ]),
    ).toEqual({
      title: 'Enregistré, mais 2 conflits',
      message: 'Salle déjà occupée, capacité dépassée',
      severity: 'warning',
    })
  })

  // Restaurer deux créneaux en conflit renvoie le même conflit deux fois.
  it('ne compte qu une fois un conflit renvoye par deux creneaux', () => {
    const salle = {
      type: 'salle' as const,
      slotIDs: ['a', 'b'],
      locationID: 'loc-1',
    }
    expect(conflictWarning([salle, { ...salle }]).title).toBe(
      'Enregistré, mais 1 conflit',
    )
  })
})
