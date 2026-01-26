import type { EventContentArg } from '@fullcalendar/core'
import { clsx } from 'clsx'
import dayjs from 'dayjs'
import { Plus } from 'lucide-react'

import { containsKeyword } from '../../../libs/utils.ts'
import type { Appointment } from '../../../types/appointment.ts'
import type { AppointmentPatient } from '../../../types/appointmentPatient.ts'
import { Button } from '../../ui/button.tsx'

type Props = {
  setOpenEventId?: (eventId: string) => void
  eventContent: EventContentArg
  editMode?: boolean
}

export const EventContent = ({
  eventContent,
  setOpenEventId,
  editMode,
}: Props) => {
  const { event, timeText } = eventContent
  const { states, appointments, thematic, type } = event.extendedProps

  const isIndividual = containsKeyword(states, ['individual'])
  const isMultiple = containsKeyword(states, ['multiple'])
  const isFillable = containsKeyword(states, ['fillable'])

  const calculateAppointmentStyle = (appointment: Appointment) => {
    if (!isIndividual) {
      return {}
    }

    const slotStart = dayjs(event.start)
    const slotEnd = dayjs(event.end)
    const aptStart = dayjs(appointment.startDate)
    const aptEnd = dayjs(appointment.endDate)

    const slotDuration = slotEnd.diff(slotStart, 'minute')
    const aptDuration = aptEnd.diff(aptStart, 'minute')
    const offsetFromStart = aptStart.diff(slotStart, 'minute')

    const heightPercent = (aptDuration / slotDuration) * 100
    const topPercent = (offsetFromStart / slotDuration) * 100

    return {
      position: 'absolute' as const,
      top: `${topPercent}%`,
      height: `calc(${heightPercent}% - 4px)`,
      left: 0,
      right: 0,
    }
  }

  return (
    <div
      {...(event.id ? { 'data-event-id': `${event.id}` } : {})}
      className={clsx(
        'fc-event-hero relative group cursor-pointer h-full w-full flex flex-col text-left p-0.5 text-neutral-100 transition duration-200',
        {
          'pointer-events-none': containsKeyword(states, ['editable']),
          'opacity-45 bg-gray-400 rounded-sm': editMode && type === 'slot',
        },
      )}
    >
      {(!isFillable || (isFillable && appointments.length === 0)) && (
        <span className="p-0.5">
          <div className="text-[0.65rem] whitespace-nowrap">{timeText}</div>
          <div className="text-[0.6rem]">{event.title}</div>
          <div className="text-[0.6rem] font-semibold truncate">{thematic}</div>
        </span>
      )}

      {/* Individual */}
      {isIndividual &&
        appointments &&
        appointments.length > 0 &&
        appointments.map((appointment: Appointment) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setOpenEventId?.(`appointment_${appointment.id}`)
            }}
            key={appointment.id}
            style={calculateAppointmentStyle(appointment)}
            className={`fc-event-hero z-1 bg-black/30 cursor-pointer flex justify-start p-0.5 m-0.5 text-white truncate px-1 border border-border rounded hover:opacity-80 transition-opacity overflow-hidden`}
          >
            {appointment.appointmentPatients?.map(
              (appointmentPatient: AppointmentPatient) => (
                <div
                  key={appointmentPatient.patient.id}
                  className="text-[0.6rem] text-white truncate"
                >
                  {appointmentPatient.patient.firstName}{' '}
                  {appointmentPatient.patient.lastName}
                </div>
              ),
            )}
          </button>
        ))}

      {/* Multiple */}
      {isMultiple && appointments && appointments.length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpenEventId?.(`appointment_${appointments[0].id}`)
          }}
          className="fc-event-hero z-1 flex-1 flex text-xs overflow-y-auto"
        >
          {event.extendedProps.appointments[0].appointmentPatients?.map(
            (appointmentPatient: AppointmentPatient) => (
              <div
                key={appointmentPatient.patient.id}
                className={`flex-1 cursor-pointer text-left text-[0.6rem] text-white bg-primary truncate p-0.5 border border-border rounded transition duration-200 hover:bg-primary-dark`}
              >
                {appointmentPatient.patient.firstName}{' '}
                {appointmentPatient.patient.lastName}
              </div>
            ),
          )}
        </button>
      )}

      {/* Bouton + pour slots multiple vides */}
      {isMultiple && (!appointments || appointments.length === 0) && (
        <div className="z-100 cursor-pointer absolute inset-0 flex justify-center items-center">
          <Button variant="transparent" className="w-full h-full">
            <div className="p-2 rounded-full bg-neutral-50 text-primary group-hover:bg-neutral-300 transition-colors duration-200">
              <Plus className="w-6 h-6" />
            </div>
          </Button>
        </div>
      )}
    </div>
  )
}
