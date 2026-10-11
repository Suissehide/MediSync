import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'

import { cycleWeekNumber } from './weekCycle.ts'

const cycle = {
  startOfWeek: '2026-01-05',
  weekCount: 3,
  forbiddenWeekStarts: ['2026-01-19', '2025-12-22'],
}
const n = (date: string) => cycleWeekNumber(dayjs.utc(date), cycle)

describe('cycleWeekNumber', () => {
  it('saute les semaines interdites, en avant comme en arrière', () => {
    expect(n('2026-01-05')).toBe(1)
    expect(n('2026-01-12')).toBe(2)
    expect(n('2026-01-19')).toBeNull()
    expect(n('2026-01-26')).toBe(3)
    expect(n('2026-02-02')).toBe(1)
    expect(n('2025-12-29')).toBe(3)
    expect(n('2025-12-22')).toBeNull()
    expect(n('2025-12-15')).toBe(2)
  })

  it('sans semaine interdite, numérote en continu', () => {
    const plain = { startOfWeek: '2026-01-05', weekCount: 6 }
    expect(cycleWeekNumber(dayjs.utc('2025-12-29'), plain)).toBe(6)
    expect(cycleWeekNumber(dayjs.utc('2026-02-16'), plain)).toBe(1)
  })
})
