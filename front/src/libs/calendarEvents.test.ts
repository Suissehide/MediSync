import { describe, expect, it } from 'vitest'

import type { Slot } from '../types/slot.ts'
import { buildCalendarEventsFromSlots } from './utils.ts'

const slot = (location?: { id: string; name: string }) =>
  ({
    id: 'slot-1',
    startDate: '2026-10-05T08:00:00.000Z',
    endDate: '2026-10-05T09:00:00.000Z',
    locked: false,
    appointments: [],
    slotTemplate: { id: 'tpl-1', soignants: [], location },
  }) as unknown as Slot

describe('buildCalendarEventsFromSlots', () => {
  it('porte la salle du creneau sur l evenement, pour le dashboard', () => {
    const [event] = buildCalendarEventsFromSlots(
      [slot({ id: 'loc-1', name: 'Salle Bleue' })],
      ['fillable'],
    )
    expect(event.extendedProps?.location).toBe('Salle Bleue')
  })

  it('laisse la salle vide quand le creneau n en a pas', () => {
    const [event] = buildCalendarEventsFromSlots([slot()], ['fillable'])
    expect(event.extendedProps?.location).toBeUndefined()
  })
})
