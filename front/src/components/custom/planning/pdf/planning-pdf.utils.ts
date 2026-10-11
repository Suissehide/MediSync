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
  /** Plage `HH:mm-HH:mm` couvrant tous les créneaux de la ligne. */
  timeKey: string
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

export const timeKeyOf = (slot: Slot) =>
  `${dayjs.utc(slot.startDate).format('HH:mm')}-${dayjs.utc(slot.endDate).format('HH:mm')}`

const isWeekday = (slot: Slot) =>
  dayjs.utc(slot.startDate).isoWeekday() <= WEEKDAY_COUNT

const byStartThenThematic = (a: Slot, b: Slot) =>
  timeKeyOf(a).localeCompare(timeKeyOf(b)) ||
  (a.slotTemplate?.thematic ?? '').localeCompare(b.slotTemplate?.thematic ?? '')

/** Plages horaires de la semaine : les créneaux qui se chevauchent, tous jours confondus, partagent une ligne. */
function groupIntoBands(slots: Slot[]) {
  const bands: { start: string; end: string }[] = []
  // `HH:mm` zéro-paddé : l'ordre alphabétique est l'ordre chronologique.
  for (const key of slots.map(timeKeyOf).sort()) {
    const [start, end] = key.split('-')
    const last = bands.at(-1)
    if (last && start < last.end) {
      last.end = end > last.end ? end : last.end
    } else {
      bands.push({ start, end })
    }
  }
  return bands
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

    const timeRows = groupIntoBands(weekSlots).map(({ start, end }) => ({
      timeKey: `${start}-${end}`,
      timeLabel: `${start}\n${end}`,
      cells: dayKeys.map((dayKey) =>
        weekSlots
          .filter((slot) => {
            const slotStart = timeKeyOf(slot).split('-')[0]
            return (
              dayKeyOf(slot.startDate) === dayKey &&
              slotStart >= start &&
              slotStart < end
            )
          })
          .sort(byStartThenThematic),
      ),
    }))

    return {
      weekStart,
      isoWeek: weekStart.isoWeek(),
      weekLabel: cycle
        ? `${cycleWeekNumber(weekStart, cycle) ?? '—'}`
        : `${weekStart.isoWeek()}`,
      isClosed: closedWeekKeys.has(weekStart.format('YYYY-MM-DD')),
      timeRows,
    }
  })
}
