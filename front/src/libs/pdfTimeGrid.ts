import dayjs from 'dayjs'

import type { Slot } from '../types/slot.ts'

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

type SlotRange = (slot: Slot) => { start: string; end: string }

const minuteOf = (date: string) => {
  const d = dayjs.utc(date)
  return d.hour() * 60 + d.minute()
}

const byThematic = (a: Slot, b: Slot) =>
  (a.slotTemplate?.thematic ?? '').localeCompare(b.slotTemplate?.thematic ?? '')

const slotRange: SlotRange = (slot) => ({
  start: slot.startDate,
  end: slot.endDate,
})

/** Un créneau ne partage la largeur qu'avec ceux qui le chevauchent, de proche en proche. */
export function layoutDay(
  slots: Slot[],
  rangeOf: SlotRange = slotRange,
): PlacedSlot[] {
  const sorted = slots
    .map((slot) => {
      const { start, end } = rangeOf(slot)
      return {
        slot,
        start: minuteOf(start),
        end: minuteOf(end),
        lane: 0,
        laneCount: 1,
      }
    })
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

/** Bornes de l'axe horaire, arrondies à l'heure : `[0, 0]` sans créneau. */
export function hourBounds(days: PlacedSlot[][]): [number, number] {
  const placed = days.flat()
  if (placed.length === 0) {
    return [0, 0]
  }
  return [
    Math.floor(Math.min(...placed.map((p) => p.start)) / 60) * 60,
    Math.ceil(Math.max(...placed.map((p) => p.end)) / 60) * 60,
  ]
}

export const formatMinute = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

/** Espaces autour du tiret : react-pdf peut y couper la ligne si la colonne est étroite. */
export const formatTimeRange = ({ start, end }: PlacedSlot) =>
  `${formatMinute(start)} – ${formatMinute(end)}`
