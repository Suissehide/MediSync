import dayjs from 'dayjs'

import type { TrackingAppointment } from '../types/pathway.ts'

export type SuiviMark = 'absent' | 'present' | 'pending'

export type SuiviDay = { mark: SuiviMark; count: number }

const markOf = (status: string | null): SuiviMark =>
  status === 'no' ? 'absent' : status === 'yes' ? 'present' : 'pending'

const PRIORITY: SuiviMark[] = ['absent', 'present', 'pending']

// Plusieurs rendez-vous le même jour : l'absence l'emporte, c'est ce qu'on cherche sur le Suivi.
export const suiviDays = (
  appointments: TrackingAppointment[],
): Map<number, SuiviDay> => {
  const days = new Map<number, SuiviDay>()
  for (const apt of appointments) {
    const day = dayjs.utc(apt.date).date()
    const mark = markOf(apt.status)
    const current = days.get(day)
    days.set(day, {
      mark:
        current && PRIORITY.indexOf(current.mark) < PRIORITY.indexOf(mark)
          ? current.mark
          : mark,
      count: (current?.count ?? 0) + 1,
    })
  }
  return days
}
