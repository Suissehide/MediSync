import dayjs from 'dayjs'

import { getSlotDisplayRange } from '../../../../libs/slotAvailability.ts'
import type { Slot } from '../../../../types/slot.ts'

export type WeekData = {
  weekLabel: string
  weekStart: dayjs.Dayjs
  timeRows: {
    timeLabel: string
    cells: (Slot | null)[] // index 0=lundi..4=vendredi
  }[]
}

// Période de fermeture du service intercalée entre deux semaines du programme.
export type ClosureData = {
  start: dayjs.Dayjs
  end: dayjs.Dayjs
}

// Consigne portée par une thématique, rappelée juste avant la semaine qui la
// contient.
export type NoticeData = {
  // La meme consigne peut revenir a plusieurs semaines : l'identifiant porte
  // la semaine qu'elle precede.
  id: string
  text: string
}

export type CalendarEntry =
  | ({ kind: 'week' } & WeekData)
  | ({ kind: 'closure' } & ClosureData)
  | ({ kind: 'notice' } & NoticeData)

export function computeProgramDuration(slots: Slot[]): {
  startDate: dayjs.Dayjs
  endDate: dayjs.Dayjs
} | null {
  if (slots.length === 0) {
    return null
  }
  const dates = slots.map((s) => dayjs.utc(s.startDate))
  const startDate = dates.reduce((a, b) => (a.isBefore(b) ? a : b))
  const endDate = dates.reduce((a, b) => (a.isAfter(b) ? a : b))
  return { startDate, endDate }
}

// Les semaines du calendrier n'affichent que le lundi au vendredi : une
// fermeture court donc du lundi au vendredi de la semaine interdite.
const CLOSURE_LAST_WEEKDAY_OFFSET = 4

// Jeton remplacé dans une consigne par les dates de la thématique sur tout le
// programme : « Prenez un seul rendez-vous parmi : %dates% ».
export const NOTICE_DATES_TOKEN = '%dates%'

const byStartDate = (a: Slot, b: Slot) =>
  dayjs.utc(a.startDate).diff(dayjs.utc(b.startDate))

// Le calendrier n'affiche que le lundi au vendredi.
const isWeekday = (slot: Slot) => {
  const dow = dayjs.utc(slot.startDate).day()
  return dow !== 0 && dow !== 6
}

// « 12/05 », « 12/05 et 19/05 », « 12/05, 19/05 et 26/05 ».
function formatDateList(dates: string[]): string {
  if (dates.length < 2) {
    return dates.join('')
  }
  return `${dates.slice(0, -1).join(', ')} et ${dates[dates.length - 1]}`
}

// Les dates de chaque thématique sur tout le programme, dédoublonnées et
// chronologiques : ce que `%dates%` remplace.
function buildDatesByThematicId(slots: Slot[]): Map<string, string> {
  const datesByThematicId = new Map<string, string[]>()

  for (const slot of slots.filter(isWeekday).sort(byStartDate)) {
    const thematicId = slot.slotTemplate?.thematicId
    if (!thematicId) {
      continue
    }
    const date = dayjs.utc(slot.startDate).format('DD/MM')
    const dates = datesByThematicId.get(thematicId) ?? []
    if (!dates.includes(date)) {
      dates.push(date)
      datesByThematicId.set(thematicId, dates)
    }
  }

  return new Map(
    [...datesByThematicId].map(([id, dates]) => [id, formatDateList(dates)]),
  )
}

// La consigne telle qu'elle s'imprime : jeton résolu, ou `null` si elle a déjà
// listé ses dates avant une semaine précédente.
function resolveNotice(
  notice: string,
  thematicId: string,
  datesByThematicId: Map<string, string>,
  thematicIdsWithDatesEmitted: Set<string>,
): string | null {
  if (!notice.includes(NOTICE_DATES_TOKEN)) {
    return notice
  }
  // Une consigne qui liste toutes les dates du programme ne se rappelle
  // qu'avant la première semaine concernée.
  if (thematicIdsWithDatesEmitted.has(thematicId)) {
    return null
  }
  thematicIdsWithDatesEmitted.add(thematicId)
  return notice
    .split(NOTICE_DATES_TOKEN)
    .join(datesByThematicId.get(thematicId) ?? '')
}

// Les consignes d'une semaine, dans l'ordre chronologique des créneaux qui les
// portent. Une même consigne n'est rappelée qu'une fois par semaine, même si
// la thématique y revient plusieurs fois.
function collectWeekNotices(
  weekdaySlots: Slot[],
  noticeByThematicId: Map<string, string>,
  datesByThematicId: Map<string, string>,
  thematicIdsWithDatesEmitted: Set<string>,
): string[] {
  const notices: string[] = []

  for (const slot of [...weekdaySlots].sort(byStartDate)) {
    const thematicId = slot.slotTemplate?.thematicId
    const notice = thematicId ? noticeByThematicId.get(thematicId) : undefined
    if (!notice || !thematicId) {
      continue
    }
    const resolved = resolveNotice(
      notice,
      thematicId,
      datesByThematicId,
      thematicIdsWithDatesEmitted,
    )
    if (resolved && !notices.includes(resolved)) {
      notices.push(resolved)
    }
  }

  return notices
}

export function buildCalendarEntries(
  slots: Slot[],
  patientId?: string,
  forbiddenWeekStarts: string[] = [],
  noticeByThematicId: Map<string, string> = new Map(),
): CalendarEntry[] {
  if (slots.length === 0) {
    return []
  }

  const sorted = [...slots].sort(byStartDate)

  const programStart = dayjs.utc(sorted[0].startDate).startOf('isoWeek')
  const programEnd = dayjs
    .utc(sorted[sorted.length - 1].startDate)
    .startOf('isoWeek')

  const forbiddenWeekKeys = new Set(
    forbiddenWeekStarts.map((date) =>
      dayjs.utc(date).startOf('isoWeek').format('YYYY-MM-DD'),
    ),
  )

  const datesByThematicId = buildDatesByThematicId(slots)
  // Un jeton de dates couvre tout le programme : une seule mention par thématique.
  const thematicIdsWithDatesEmitted = new Set<string>()

  const entries: CalendarEntry[] = []
  let current = programStart
  let weekIndex = 1
  let pendingClosure: ClosureData | null = null

  // Une fermeture ne se justifie qu'entre deux semaines du programme : on ne
  // l'ajoute qu'une fois qu'une semaine la précède, et jamais en fin de
  // programme (la boucle s'arrête sur la dernière semaine avec rendez-vous).
  const flushClosure = () => {
    if (pendingClosure && entries.length > 0) {
      entries.push({ kind: 'closure', ...pendingClosure })
    }
    pendingClosure = null
  }

  while (current.isBefore(programEnd) || current.isSame(programEnd, 'day')) {
    const weekSlots = slots.filter((s) => {
      const d = dayjs.utc(s.startDate)
      return (
        (d.isAfter(current) || d.isSame(current, 'day')) &&
        d.isBefore(current.add(7, 'day'))
      )
    })

    const weekdaySlots = weekSlots.filter(isWeekday)
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

    const isForbidden = forbiddenWeekKeys.has(current.format('YYYY-MM-DD'))

    if (timeRows.length > 0) {
      flushClosure()
      const notices = collectWeekNotices(
        weekdaySlots,
        noticeByThematicId,
        datesByThematicId,
        thematicIdsWithDatesEmitted,
      )
      notices.forEach((text, noticeIndex) => {
        entries.push({
          kind: 'notice',
          id: `${current.format('YYYY-MM-DD')}-${noticeIndex}`,
          text,
        })
      })
      entries.push({
        kind: 'week',
        // Rendez-vous maintenus pendant une fermeture : semaine hors numérotation.
        weekLabel: isForbidden ? 'Semaine bonus' : `Semaine ${weekIndex}`,
        weekStart: current,
        timeRows,
      })
      // La numérotation ne compte que les semaines affichées : une semaine
      // interdite ne crée pas de trou entre « Semaine 2 » et « Semaine 4 ».
      if (!isForbidden) {
        weekIndex++
      }
    } else if (isForbidden) {
      const closureEnd = current.add(CLOSURE_LAST_WEEKDAY_OFFSET, 'day')
      // Des semaines interdites qui se suivent ne donnent qu'une seule mention.
      if (pendingClosure?.end.add(3, 'day').isSame(current, 'day')) {
        pendingClosure = { start: pendingClosure.start, end: closureEnd }
      } else {
        flushClosure()
        pendingClosure = { start: current, end: closureEnd }
      }
    } else {
      // Semaine sans rendez-vous alors que le service est ouvert : rien à dire.
      flushClosure()
    }

    current = current.add(7, 'day')
  }

  return entries
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
