import dayjs from 'dayjs'

import type { Slot } from '../../../../types/slot.ts'

export type WeekData = {
  weekLabel: string
  weekStart: dayjs.Dayjs
  timeRows: {
    timeLabel: string
    cells: (Slot | null)[] // index 0=lundi..4=vendredi
  }[]
}

export function computeProgramDuration(slots: Slot[]): {
  weeks: number
  startDate: dayjs.Dayjs
  endDate: dayjs.Dayjs
} | null {
  if (slots.length === 0) {
    return null
  }
  const dates = slots.map((s) => dayjs.utc(s.startDate))
  const startDate = dates.reduce((a, b) => (a.isBefore(b) ? a : b))
  const endDate = dates.reduce((a, b) => (a.isAfter(b) ? a : b))
  const weeks = endDate.startOf('isoWeek').diff(startDate.startOf('isoWeek'), 'week') + 1
  return { weeks, startDate, endDate }
}

export function groupSlotsByWeek(slots: Slot[]): WeekData[] {
  if (slots.length === 0) {
    return []
  }

  const sorted = [...slots].sort((a, b) =>
    dayjs.utc(a.startDate).diff(dayjs.utc(b.startDate)),
  )

  const programStart = dayjs.utc(sorted[0].startDate).startOf('isoWeek')
  const programEnd = dayjs.utc(sorted[sorted.length - 1].startDate).startOf(
    'isoWeek',
  )

  const result: WeekData[] = []
  let current = programStart
  let weekIndex = 1

  while (current.isBefore(programEnd) || current.isSame(programEnd, 'day')) {
    const weekSlots = slots.filter((s) => {
      const d = dayjs.utc(s.startDate)
      return (
        (d.isAfter(current) || d.isSame(current, 'day')) &&
        d.isBefore(current.add(7, 'day'))
      )
    })

    const weekdaySlots = weekSlots.filter((s) => {
      const dow = dayjs.utc(s.startDate).day()
      return dow !== 0 && dow !== 6
    })
    const timeKeys = Array.from(
      new Set(
        weekdaySlots.map((s) =>
          `${dayjs.utc(s.startDate).format('HH:mm')}-${dayjs.utc(s.endDate).format('HH:mm')}`,
        ),
      ),
    ).sort()

    const timeRows = timeKeys.map((timeKey) => {
      const [start, end] = timeKey.split('-')
      const cells: (Slot | null)[] = Array.from({ length: 5 }, (_, i) => {
        const day = current.add(i, 'day')
        return (
          weekdaySlots.find(
            (s) =>
              dayjs.utc(s.startDate).isSame(day, 'day') &&
              dayjs.utc(s.startDate).format('HH:mm') === start &&
              dayjs.utc(s.endDate).format('HH:mm') === end,
          ) ?? null
        )
      })
      return { timeLabel: timeKey.replace('-', '\n'), cells }
    })

    if (timeRows.length === 0) {
      timeRows.push({
        timeLabel: '',
        cells: [null, null, null, null, null],
      })
    }

    result.push({
      weekLabel: `Semaine ${weekIndex}`,
      weekStart: current,
      timeRows,
    })

    current = current.add(7, 'day')
    weekIndex++
  }

  return result
}

export function getLabel<T extends Record<string, string>>(
  obj: T,
  key: string | undefined,
): string {
  if (!key) {
    return 'Non spécifié'
  }
  return obj[key as keyof T] ?? key
}
