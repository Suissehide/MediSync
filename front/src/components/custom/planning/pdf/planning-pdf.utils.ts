import dayjs, { type Dayjs } from 'dayjs'

import type { PlanningCycle } from '../../../../types/planningCycle.ts'
import type { Slot } from '../../../../types/slot.ts'
import { cycleWeekNumber } from '../../../../utils/weekCycle.ts'

/**
 * Une case de la grille. Contrairement au programme d'un patient, le planning
 * du service peut faire cohabiter plusieurs parcours sur le même horaire : une
 * case porte donc une liste de créneaux, pas un créneau unique.
 */
export type PlanningTimeRow = {
  timeLabel: string
  /** Index 0 = lundi … 4 = vendredi. */
  cells: Slot[][]
}

export type PlanningWeek = {
  weekStart: Dayjs
  isoWeek: number
  /** Libellé affiché en titre de page : numéro de cycle ou numéro ISO. */
  weekLabel: string
  /** Semaine interdite : le service est fermé. */
  isClosed: boolean
  timeRows: PlanningTimeRow[]
}

/** Le PDF reprend la vue calendrier, qui masque samedi et dimanche. */
const WEEKDAY_COUNT = 5

const dayKeyOf = (date: string) => dayjs.utc(date).format('YYYY-MM-DD')

const timeKeyOf = (slot: Slot) =>
  `${dayjs.utc(slot.startDate).format('HH:mm')}-${dayjs.utc(slot.endDate).format('HH:mm')}`

const isWeekday = (slot: Slot) =>
  dayjs.utc(slot.startDate).isoWeekday() <= WEEKDAY_COUNT

const byThematic = (a: Slot, b: Slot) =>
  (a.slotTemplate?.thematic ?? '').localeCompare(b.slotTemplate?.thematic ?? '')

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

    // Les horaires sont zéro-paddés (`09:00-10:30`) : l'ordre alphabétique est
    // aussi l'ordre chronologique.
    const timeKeys = Array.from(new Set(weekSlots.map(timeKeyOf))).sort()

    const timeRows = timeKeys.map((timeKey) => ({
      timeLabel: timeKey.replace('-', '\n'),
      cells: dayKeys.map((dayKey) =>
        weekSlots
          .filter(
            (slot) =>
              timeKeyOf(slot) === timeKey && dayKeyOf(slot.startDate) === dayKey,
          )
          .sort(byThematic),
      ),
    }))

    return {
      weekStart,
      isoWeek: weekStart.isoWeek(),
      weekLabel: cycle
        ? `${cycleWeekNumber(weekStart, cycle)}`
        : `${weekStart.isoWeek()}`,
      isClosed: closedWeekKeys.has(weekStart.format('YYYY-MM-DD')),
      timeRows,
    }
  })
}
