import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { describe, expect, it } from 'vitest'

import type { Slot } from '../../../../types/slot.ts'
import { layoutDay } from './planning-pdf.utils.ts'

dayjs.extend(utc)

const slot = (id: string, start: string, end: string) =>
  ({
    id,
    startDate: `2026-10-12T${start}:00Z`,
    endDate: `2026-10-12T${end}:00Z`,
  }) as Slot

const lanes = (slots: Slot[]) =>
  layoutDay(slots).map(({ slot, lane, laneCount }) => [
    slot.id,
    lane,
    laneCount,
  ])

describe('layoutDay', () => {
  it('ne partage la largeur qu’entre créneaux qui se chevauchent', () => {
    expect(
      lanes([
        slot('a', '09:00', '11:00'),
        slot('b', '10:00', '12:00'),
        slot('c', '11:00', '12:00'),
        slot('d', '14:00', '15:00'),
      ]),
    ).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 2],
      ['d', 0, 1],
    ])
  })
})
