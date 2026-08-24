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

// Pour un créneau individuel, chaque patient a son propre rendez-vous (une
// sous-plage du créneau). On affiche alors l'horaire du rendez-vous du patient
// plutôt que celui du créneau entier. Sinon, on garde l'horaire du créneau.
function getSlotDisplayRange(
  slot: Slot,
  patientId?: string,
): { start: string; end: string } {
  if (slot.slotTemplate?.isIndividual && patientId) {
    const appointment = slot.appointments?.find((a) =>
      a.appointmentPatients?.some((ap) => ap.patient.id === patientId),
    )
    if (appointment) {
      return { start: appointment.startDate, end: appointment.endDate }
    }
  }
  return { start: slot.startDate, end: slot.endDate }
}

export function groupSlotsByWeek(
  slots: Slot[],
  patientId?: string,
): WeekData[] {
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
        weekdaySlots.map((s) => {
          const { start, end } = getSlotDisplayRange(s, patientId)
          return `${dayjs.utc(start).format('HH:mm')}-${dayjs.utc(end).format('HH:mm')}`
        }),
      ),
    ).sort()

    const timeRows = timeKeys.map((timeKey) => {
      const [start, end] = timeKey.split('-')
      const cells: (Slot | null)[] = Array.from({ length: 5 }, (_, i) => {
        const day = current.add(i, 'day')
        return (
          weekdaySlots.find((s) => {
            const range = getSlotDisplayRange(s, patientId)
            return (
              dayjs.utc(range.start).isSame(day, 'day') &&
              dayjs.utc(range.start).format('HH:mm') === start &&
              dayjs.utc(range.end).format('HH:mm') === end
            )
          }) ?? null
        )
      })
      return { timeLabel: timeKey.replace('-', '\n'), cells }
    })

    // Semaine sans aucun rendez-vous (ex. semaine interdite) : on n'affiche pas
    // de tableau vide, mais on conserve la numérotation réelle des semaines.
    if (timeRows.length > 0) {
      result.push({
        weekLabel: `Semaine ${weekIndex}`,
        weekStart: current,
        timeRows,
      })
    }

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
