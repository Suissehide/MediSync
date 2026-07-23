import Boom from '@hapi/boom'
import dayjs from 'dayjs'

import { toStartOfWeek } from './date'

export type ForbiddenWeekLike = { startOfWeek: Date }

/**
 * Maps each logical week index of a pathway to an actual week offset that
 * skips forbidden weeks, so the pathway spans over them instead of being
 * shifted entirely.
 */
export function buildWeekMapping(
  startDate: Date | string,
  maxOffsetDays: number,
  forbiddenWeeks: ForbiddenWeekLike[],
): Map<number, number> {
  const adjustedStart = dayjs(startDate)

  const isWeekForbidden = (date: Date): boolean => {
    const weekStart = dayjs(toStartOfWeek(date))
    return forbiddenWeeks.some((fw) => {
      return weekStart.isSame(dayjs(fw.startOfWeek), 'day')
    })
  }

  const maxLogicalWeek = Math.floor(maxOffsetDays / 7)

  const weekMapping = new Map<number, number>()
  let actualWeekOffset = 0
  for (let logicalWeek = 0; logicalWeek <= maxLogicalWeek; logicalWeek++) {
    while (
      isWeekForbidden(adjustedStart.add(actualWeekOffset * 7, 'day').toDate())
    ) {
      actualWeekOffset++
      if (actualWeekOffset > logicalWeek + 52) {
        throw Boom.conflict(
          'Aucune date de début disponible dans les 52 prochaines semaines en raison des semaines interdites',
        )
      }
    }
    weekMapping.set(logicalWeek, actualWeekOffset)
    actualWeekOffset++
  }
  return weekMapping
}

/** Applies the forbidden-week week mapping to a single slot template offset. */
export function computeEffectiveOffset(
  originalOffset: number,
  weekMapping: Map<number, number>,
): number {
  const logicalWeek = Math.floor(originalOffset / 7)
  const dayInWeek = originalOffset % 7
  const actualWeek = weekMapping.get(logicalWeek) ?? logicalWeek
  return actualWeek * 7 + dayInWeek
}
