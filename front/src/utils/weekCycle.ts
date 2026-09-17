import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import utc from 'dayjs/plugin/utc'

import type { PlanningCycle } from '../types/planningCycle.ts'

dayjs.extend(isoWeek)
dayjs.extend(utc)

/**
 * Position de `date` dans le cycle, entre 1 et `cycle.weekCount`.
 *
 * Le modulo est volontairement « positif » : `((n % m) + m) % m`. En JavaScript
 * `-1 % 6` vaut `-1`, ce qui donnerait un numéro nul ou négatif pour les
 * semaines antérieures à la semaine de départ. Or le cycle se prolonge vers
 * l'arrière : avec un départ au 05/01 et un cycle de 6, la semaine du 29/12
 * doit afficher S6.
 */
export function cycleWeekNumber(date: Dayjs, cycle: PlanningCycle): number {
  const start = dayjs.utc(cycle.startOfWeek).startOf('isoWeek')
  const current = dayjs.utc(date.format('YYYY-MM-DD')).startOf('isoWeek')

  const weeksFromStart = current.diff(start, 'week')
  const position =
    ((weeksFromStart % cycle.weekCount) + cycle.weekCount) % cycle.weekCount

  return position + 1
}
