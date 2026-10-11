import dayjs, { type Dayjs } from 'dayjs'

import {
  hourBounds,
  layoutDay,
  type PlacedSlot,
} from '../../../../libs/pdfTimeGrid.ts'
import type { PlanningCycle } from '../../../../types/planningCycle.ts'
import type { Slot } from '../../../../types/slot.ts'
import { cycleWeekNumber } from '../../../../utils/weekCycle.ts'

export type PlanningWeek = {
  weekStart: Dayjs
  isoWeek: number
  /** Libellé affiché en titre de page : numéro de cycle ou numéro ISO. */
  weekLabel: string
  /** Semaine interdite : le service est fermé. */
  isClosed: boolean
  /** Bornes de l'axe horaire, arrondies à l'heure (minutes depuis minuit). */
  startMinute: number
  endMinute: number
  /** Index 0 = lundi … 4 = vendredi. */
  days: PlacedSlot[][]
}

/** Le PDF reprend la vue calendrier, qui masque samedi et dimanche. */
const WEEKDAY_COUNT = 5

const dayKeyOf = (date: string) => dayjs.utc(date).format('YYYY-MM-DD')

const isWeekday = (slot: Slot) =>
  dayjs.utc(slot.startDate).isoWeekday() <= WEEKDAY_COUNT

/**
 * Découpe les créneaux en `weekCount` semaines consécutives à partir de
 * `firstWeekStart`, attendu en UTC et positionné sur un lundi. Les semaines
 * sans créneau sont conservées : l'utilisateur a demandé un nombre de semaines
 * fixe, pas seulement celles qui sont remplies.
 */
export function buildPlanningWeeks(
  slots: Slot[],
  firstWeekStart: Dayjs,
  weekCount: number,
  forbiddenWeekStarts: string[] = [],
  cycle?: PlanningCycle | null,
): PlanningWeek[] {
  const closedWeekKeys = new Set(
    forbiddenWeekStarts.map((date) =>
      dayjs.utc(date).startOf('isoWeek').format('YYYY-MM-DD'),
    ),
  )

  const weekdaySlots = slots.filter(isWeekday)

  return Array.from({ length: weekCount }, (_, weekIndex) => {
    const weekStart = firstWeekStart.add(weekIndex * 7, 'day')
    const dayKeys = Array.from({ length: WEEKDAY_COUNT }, (_, dayIndex) =>
      weekStart.add(dayIndex, 'day').format('YYYY-MM-DD'),
    )
    const weekSlots = weekdaySlots.filter((slot) =>
      dayKeys.includes(dayKeyOf(slot.startDate)),
    )

    const days = dayKeys.map((dayKey) =>
      layoutDay(
        weekSlots.filter((slot) => dayKeyOf(slot.startDate) === dayKey),
      ),
    )
    const [startMinute, endMinute] = hourBounds(days)

    return {
      weekStart,
      isoWeek: weekStart.isoWeek(),
      weekLabel: cycle
        ? `${cycleWeekNumber(weekStart, cycle) ?? '—'}`
        : `${weekStart.isoWeek()}`,
      isClosed: closedWeekKeys.has(weekStart.format('YYYY-MM-DD')),
      startMinute,
      endMinute,
      days,
    }
  })
}
