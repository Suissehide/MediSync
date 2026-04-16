import type { EventContentArg } from '@fullcalendar/core'
import { clsx } from 'clsx'
import dayjs from 'dayjs'
import {
  Copy,
  Lock,
  LockOpen,
  MessageSquareTextIcon,
  Plus,
  Trash2,
} from 'lucide-react'

import { containsKeyword } from '../../../libs/utils.ts'
import type { Appointment } from '../../../types/appointment.ts'
import type { AppointmentPatient } from '../../../types/appointmentPatient.ts'
import { Button } from '../../ui/button.tsx'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '../../ui/tooltip.tsx'

type Props = {
  setOpenEventId?: (eventId: string) => void
  eventContent: EventContentArg
  editMode?: boolean
  onDuplicate?: (eventId: string) => void
  onDelete?: (eventId: string) => void
  onToggleLock?: (eventId: string, locked: boolean) => void
}

export const EventContent = ({
  eventContent,
  setOpenEventId,
  editMode,
  onDuplicate,
  onDelete,
  onToggleLock,
}: Props) => {
  const { event, timeText } = eventContent
  const { states, appointments, thematic, type, locked } = event.extendedProps

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
        'fc-event-hero relative group cursor-pointer h-full w-full flex flex-col text-left p-0.5 text-text-dark transition duration-200',
        {
          'pointer-events-none': containsKeyword(states, ['editable']),
          'opacity-45 bg-gray-400 rounded-sm': editMode && type === 'slot',
        },
      )}
    >
      {locked && type === 'slot' && (
        <div
          className={clsx(
            'absolute top-0.5 left-0.5 z-10 p-0.5 rounded bg-black/40 text-white pointer-events-none',
            { 'pointer-events-auto cursor-pointer hover:bg-black/60': !!onToggleLock },
          )}
          onClick={(e) => {
            if (!onToggleLock) { return }
            e.stopPropagation()
            onToggleLock(event.id, false)
          }}
          onMouseDown={(e) => {
            if (!onToggleLock) { return }
            e.stopPropagation()
          }}
        >
          <Lock className="w-2.5 h-2.5" />
        </div>
      )}

      {onToggleLock &&
        !locked &&
        !containsKeyword(states, ['editable', 'individual', 'multiple']) &&
        type === 'slot' && (
          <Button
            variant="none"
            className="absolute top-0.5 left-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 h-auto w-auto p-0.5 rounded bg-black/20 hover:bg-black/40 text-white"
            onClick={(e) => {
              e.stopPropagation()
              onToggleLock(event.id, true)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <LockOpen className="w-2.5 h-2.5" />
          </Button>
        )}

      {onDuplicate &&
        !containsKeyword(states, ['editable', 'individual', 'multiple']) &&
        (type === 'slot' || type === 'template') && (
          <Button
            variant="none"
            className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 h-auto w-auto p-0.5 rounded bg-black/20 hover:bg-black/40 text-white"
            onClick={(e) => {
              e.stopPropagation()
              onDuplicate(event.id)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Copy className="w-2.5 h-2.5" />
          </Button>
        )}

      {onDelete &&
        !containsKeyword(states, ['editable', 'individual', 'multiple']) &&
        (type === 'slot' || type === 'template') && (
          <Button
            variant="none"
            className="absolute top-5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 h-auto w-auto p-0.5 rounded bg-black/20 hover:bg-red-500 text-white"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(event.id)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Trash2 className="w-2.5 h-2.5" />
          </Button>
        )}

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
                <PatientName
                  key={appointmentPatient.patient.id}
                  appointmentPatient={appointmentPatient}
                />
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
          className={`fc-event-hero z-1 cursor-pointer flex-1 flex flex-col justify-start p-0.5 m-0.5 text-white bg-black/30 px-1 border border-border rounded hover:opacity-80 transition-opacity overflow-hidden`}
        >
          {event.extendedProps.appointments[0].appointmentPatients?.map(
            (appointmentPatient: AppointmentPatient) => (
              <PatientName
                key={appointmentPatient.patient.id}
                appointmentPatient={appointmentPatient}
              />
            ),
          )}
        </button>
      )}

      {/* Bouton + pour slots multiple vides */}
      {isMultiple && !locked && (!appointments || appointments.length === 0) && (
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

function PatientName({ appointmentPatient }: { appointmentPatient: AppointmentPatient }) {
  const name = `${appointmentPatient.patient.firstName} ${appointmentPatient.patient.lastName}`

  if (!appointmentPatient.transmissionNotes) {
    return (
      <div className="flex-1 text-left text-[0.6rem] text-white truncate">
        {name}
      </div>
    )
  }

  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <div className="flex-1 text-left text-[0.6rem] text-white truncate flex justify-between gap-0.5">
            <span className="truncate">{name}</span>
            <MessageSquareTextIcon className="w-2.5 h-2.5 shrink-0" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {appointmentPatient.transmissionNotes}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}
