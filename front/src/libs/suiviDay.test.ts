import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { describe, expect, it } from 'vitest'

import { suiviDays } from './suiviDay.ts'

// `main.tsx` l'installe dans l'application ; un test de lib ne le charge pas.
dayjs.extend(utc)

describe('suiviDays', () => {
  it('distingue present, absent et non pointe', () => {
    const days = suiviDays([
      { date: '2026-03-02T09:00:00.000Z', status: 'yes' },
      { date: '2026-03-03T09:00:00.000Z', status: 'no' },
      { date: '2026-03-04T09:00:00.000Z', status: null },
    ])
    expect(days.get(2)).toEqual({ mark: 'present', count: 1 })
    expect(days.get(3)).toEqual({ mark: 'absent', count: 1 })
    expect(days.get(4)).toEqual({ mark: 'pending', count: 1 })
  })

  it('garde tous les rendez-vous du jour et fait ressortir l absence', () => {
    const days = suiviDays([
      { date: '2026-03-05T09:00:00.000Z', status: 'yes' },
      { date: '2026-03-05T14:00:00.000Z', status: 'no' },
      { date: '2026-03-05T16:00:00.000Z', status: null },
    ])
    expect(days.get(5)).toEqual({ mark: 'absent', count: 3 })
  })

  it('une presence l emporte sur un rendez-vous non pointe', () => {
    const days = suiviDays([
      { date: '2026-03-06T09:00:00.000Z', status: null },
      { date: '2026-03-06T14:00:00.000Z', status: 'yes' },
    ])
    expect(days.get(6)).toEqual({ mark: 'present', count: 2 })
  })
})
