import dayjs, { type Dayjs } from 'dayjs'

import type { PlanningCycle } from '../../../../types/planningCycle.ts'
import type { Slot } from '../../../../types/slot.ts'
import { cycleWeekNumber } from '../../../../utils/weekCycle.ts'

/** Un créneau placé sur l'axe horaire de son jour. */
export type PlacedSlot = {
  slot: Slot
  /** Minutes depuis minuit (UTC). */
  start: number
  end: number
  /** Colonne occupée parmi `laneCount` quand des créneaux se chevauchent. */
  lane: number
  laneCount: number
}

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

const minuteOf = (date: string) => {
  const d = dayjs.utc(date)
  return d.hour() * 60 + d.minute()
}

const isWeekday = (slot: Slot) =>
  dayjs.utc(slot.startDate).isoWeekday() <= WEEKDAY_COUNT

const byThematic = (a: Slot, b: Slot) =>
  (a.slotTemplate?.thematic ?? '').localeCompare(b.slotTemplate?.thematic ?? '')

/** Un créneau ne partage la largeur qu'avec ceux qui le chevauchent, de proche en proche. */
export function layoutDay(slots: Slot[]): PlacedSlot[] {
  const sorted = slots
    .map((slot) => ({
      slot,
      start: minuteOf(slot.startDate),
      end: minuteOf(slot.endDate),
      lane: 0,
      laneCount: 1,
    }))
    .sort((a, b) => a.start - b.start || byThematic(a.slot, b.slot))

  let group: PlacedSlot[] = []
  let groupEnd = -1
  let laneEnds: number[] = []
  const closeGroup = () => {
    for (const placed of group) {
      placed.laneCount = laneEnds.length
    }
    group = []
    laneEnds = []
  }

  for (const placed of sorted) {
    if (placed.start >= groupEnd) {
      closeGroup()
    }
    const freeLane = laneEnds.findIndex((end) => end <= placed.start)
    placed.lane = freeLane === -1 ? laneEnds.length : freeLane
    laneEnds[placed.lane] = placed.end
    groupEnd = Math.max(groupEnd, placed.end)
    group.push(placed)
  }
  closeGroup()
  return sorted
}

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
    const placed = days.flat()
    const hourBounds = placed.length
      ? [
          Math.floor(Math.min(...placed.map((p) => p.start)) / 60) * 60,
          Math.ceil(Math.max(...placed.map((p) => p.end)) / 60) * 60,
        ]
      : [0, 0]

    return {
      weekStart,
      isoWeek: weekStart.isoWeek(),
      weekLabel: cycle
        ? `${cycleWeekNumber(weekStart, cycle) ?? '—'}`
        : `${weekStart.isoWeek()}`,
      isClosed: closedWeekKeys.has(weekStart.format('YYYY-MM-DD')),
      startMinute: hourBounds[0],
      endMinute: hourBounds[1],
      days,
    }
  })
}
