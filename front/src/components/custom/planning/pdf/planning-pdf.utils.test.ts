import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import utc from 'dayjs/plugin/utc'
import { describe, expect, it } from 'vitest'

import type { Slot } from '../../../../types/slot.ts'
import { buildPlanningWeeks } from './planning-pdf.utils.ts'

dayjs.extend(utc)
dayjs.extend(isoWeek)

const slot = (id: string, start: string, end: string) =>
  ({ id, startDate: start, endDate: end }) as Slot

const monday = dayjs.utc('2026-10-12')

describe('buildPlanningWeeks', () => {
  it('regroupe en une ligne les horaires qui se chevauchent sur des jours différents', () => {
    const [week] = buildPlanningWeeks(
      [
        slot('lun', '2026-10-12T09:00:00Z', '2026-10-12T11:00:00Z'),
        slot('mar', '2026-10-13T10:00:00Z', '2026-10-13T12:00:00Z'),
        slot('apres', '2026-10-12T12:00:00Z', '2026-10-12T13:00:00Z'),
      ],
      monday,
      1,
    )

    expect(week.timeRows.map((row) => row.timeKey)).toEqual([
      '09:00-12:00',
      '12:00-13:00',
    ])
    expect(week.timeRows[0].cells.map((cell) => cell.map((s) => s.id))).toEqual(
      [['lun'], ['mar'], [], [], []],
    )
  })
})
