import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { describe, expect, it } from 'vitest'

import type { SlotSuggestion } from '../../../libs/slotAvailability.ts'
import type { Slot } from '../../../types/slot.ts'
import {
  getCapacityLabel,
  groupSuggestionsByDay,
} from './addPatientToSlotForm.tsx'

// `main.tsx` l'installe dans l'application ; un test isolé ne le charge pas.
dayjs.extend(utc)

const suggestion = (
  overrides: Partial<SlotSuggestion> = {},
  startDate = '2026-10-23T09:45:00Z',
): SlotSuggestion => ({
  slot: { id: startDate, startDate } as Slot,
  alreadyBooked: false,
  isFull: false,
  bookedCount: 1,
  capacity: 8,
  isIndividual: false,
  ...overrides,
})

describe('getCapacityLabel', () => {
  it.each([
    [{}, '7 places libres sur 8'],
    [{ bookedCount: 7 }, '1 place libre sur 8'],
    [{ isIndividual: true }, 'Individuel · libre'],
    [{ isFull: true, bookedCount: 8 }, 'Complet'],
    [{ alreadyBooked: true }, 'Déjà inscrit·e'],
    [{ alreadyBooked: true, isFull: true }, 'Déjà inscrit·e'],
  ])('%o → %s', (overrides, label) => {
    expect(getCapacityLabel(suggestion(overrides))).toBe(label)
  })
})

describe('groupSuggestionsByDay', () => {
  it('regroupe les créneaux consécutifs du même jour', () => {
    const days = groupSuggestionsByDay([
      suggestion({}, '2026-10-23T09:45:00Z'),
      suggestion({}, '2026-10-23T13:45:00Z'),
      suggestion({}, '2026-11-06T09:45:00Z'),
    ])
    expect(
      days.map((d) => [d.day, d.suggestions.map((s) => s.slot.id)]),
    ).toEqual([
      ['2026-10-23', ['2026-10-23T09:45:00Z', '2026-10-23T13:45:00Z']],
      ['2026-11-06', ['2026-11-06T09:45:00Z']],
    ])
  })
})
