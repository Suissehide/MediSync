import { type ClassValue, clsx } from 'clsx'
import dayjs from 'dayjs'
import { twMerge } from 'tailwind-merge'

import type { CalendarEvent } from '../components/custom/Calendar/calendar.tsx'
import type { Appointment } from '../types/appointment.ts'
import type { Slot } from '../types/slot.ts'
import type { SlotTemplate } from '../types/slotTemplate.ts'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safeParse<T>(value: string | null, fallback: T): T {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

export const containsKeyword = (states: string[], keywords: string[]) =>
  states && keywords.some((keyword) => states.includes(keyword))

/**
 * Transforme un objet {clé: label} en [{value, label}]
 */
export function toSelectOptions<T extends Record<string, string>>(dict: T) {
  return Object.entries(dict).map(([value, label]) => ({
    value,
    label,
  }))
}

export function getLabel<T extends Record<string, string>>(
  dict: T,
  value: string | null | undefined,
  fallback: string = '-',
): string {
  if (!value) {
    return fallback
  }
  return dict[value] || value
}

/**
 * Event
 */
export const buildCalendarEventsFromSlots = (
  slots: Slot[],
  states: string[],
): CalendarEvent[] => {
  if (!slots) {
    return []
  }
  return slots.map((slot) => {
    const slotStates = [...states]

    if (containsKeyword(slotStates, ['fillable'])) {
      slotStates.push(
        slot.slotTemplate.isIndividual ? 'individual' : 'multiple',
      )
    }

    const display =
      containsKeyword(slotStates, ['individual', 'editable']) ||
      (containsKeyword(slotStates, ['multiple']) &&
        slot.appointments.length > 0)
        ? 'background'
        : 'block'

    return {
      id: slot.id,
      title: slot.slotTemplate.soignant?.name ?? 'Soignant inconnu',
      start: slot.startDate,
      end: slot.endDate,
      color: slot.slotTemplate.color ?? '#2563eb',
      display,
      className: containsKeyword(slotStates, ['multiple'])
        ? 'event--readonly'
        : '',
      extendedProps: {
        type: 'slot',
        states: slotStates,
        templateID: slot.slotTemplate.id,
        appointments: slot.appointments,
      },
    }
  })
}

export const buildCalendarEventsFromSlotTemplates = (
  slotTemplates: SlotTemplate[],
  startDate: string,
): CalendarEvent[] => {
  if (!slotTemplates) {
    return []
  }
  return slotTemplates.map((slotTemplate) => {
    const offset = slotTemplate.offsetDays ?? 0
    const base = dayjs(startDate).add(offset, 'day').toISOString()

    const start = combineDateAndTime(base, slotTemplate.startTime)
    const end = combineDateAndTime(base, slotTemplate.endTime)

    return {
      id: slotTemplate.id,
      title: slotTemplate.soignant?.name ?? 'Soignant inconnu',
      start: start.toISOString(),
      end: end.toISOString(),
      color: slotTemplate.color ?? '#2563eb',
      extendedProps: {
        type: 'slot',
      },
    }
  })
}

export const buildCalendarEventsFromAppointments = (
  appointments: Appointment[],
): CalendarEvent[] => {
  if (!appointments) {
    return []
  }
  return appointments.map((appointment) => {
    // const thematicOption = APPOINTMENT_THEMATIC_OPTIONS.find(
    //   (option) => option.value === appointment.thematic,
    // )

    return {
      id: appointment.id,
      title: appointment.thematic ?? '',
      start: appointment.startDate,
      end: appointment.endDate,
      color: '#7CA2F3',
      display: 'block',
      className: 'cursor-pointer transition duration-300 hover:bg-primary!',
      extendedProps: {
        type: 'appointment',
        appointmentPatients: appointment.appointmentPatients,
      },
    }
  })
}

/**
 * Date / Time
 */
export function combineDateAndTime(
  date: Date | string,
  time: Date | string,
): Date {
  const baseDate = dayjs.utc(date)
  const baseTime = dayjs.utc(time)

  return baseDate
    .hour(baseTime.hour())
    .minute(baseTime.minute())
    .second(baseTime.second())
    .millisecond(baseTime.millisecond())
    .toDate()
}

export const formatDuration = (start?: Date | string, end?: Date | string) => {
  if (!start || !end) {
    return ''
  }

  const diffInMinutes = dayjs(end).diff(dayjs(start), 'minute')
  const hours = Math.floor(diffInMinutes / 60)
  const minutes = diffInMinutes % 60

  if (hours === 0) {
    return `(${minutes}min)`
  }

  if (minutes === 0) {
    return `(${hours}h)`
  }

  return `(${hours}h${minutes})`
}

export const generateDurationOptions = (
  startDate?: string,
  maxDate?: string,
) => {
  if (!startDate || !maxDate) {
    return []
  }

  const maxMinutes = dayjs(maxDate).diff(dayjs(startDate), 'minute')
  const options = []

  for (let min = 15; min <= maxMinutes; min += 15) {
    const hours = Math.floor(min / 60)
    const minutes = min % 60
    let label = ''
    if (hours && minutes) {
      label = `${hours}h${minutes}`
    } else if (hours) {
      label = `${hours}h`
    } else {
      label = `${minutes}min`
    }

    options.push({ label, value: min.toString() })
  }

  return options
}
