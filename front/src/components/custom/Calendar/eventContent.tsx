import type { EventContentArg } from '@fullcalendar/core'
import { clsx } from 'clsx'
import dayjs from 'dayjs'
import {
  Check,
  Copy,
  Lock,
  LockOpen,
  MessageSquareTextIcon,
  Plus,
  Trash2,
} from 'lucide-react'

import { darkenHex } from '../../../libs/color.ts'
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
  selectedSlotIds?: Set<string>
  onToggleSelect?: (eventId: string) => void
}

export const EventContent = ({
  eventContent,
  setOpenEventId,
  editMode,
  onDuplicate,
  onDelete,
  onToggleLock,
  selectedSlotIds,
  onToggleSelect,
}: Props) => {
  const { event, view } = eventContent
  const { states, appointments, thematic, type, locked } = event.extendedProps
  const isWeekView = view.type === 'timeGridWeek'
  const isRowLayout = !isWeekView

  const isIndividual = containsKeyword(states, ['individual'])
  const isMultiple = containsKeyword(states, ['multiple'])
  const isSelected = selectedSlotIds?.has(event.id) ?? false
  const isSelectionMode = selectedSlotIds && selectedSlotIds.size > 0

  const slotColor = event.backgroundColor || event.borderColor || '#2563eb'
  const appointmentColor = darkenHex(slotColor, 0.3)

  const calculateAppointmentStyle = (appointment: Appointment) => {
    if (!isIndividual) {
      return { backgroundColor: appointmentColor }
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
      top: `calc(${topPercent}% + 1px)`,
      height: `calc(${heightPercent}% - 2px)`,
      left: 0,
      right: 0,
      backgroundColor: appointmentColor,
    }
  }

  return (
    <div
      {...(event.id ? { 'data-event-id': `${event.id}` } : {})}
      className={clsx(
        'fc-event-hero relative group cursor-pointer h-full w-full flex text-left p-0.5 transition duration-200',
        isRowLayout ? 'flex-row' : 'flex-col',
        {
          'pointer-events-none': containsKeyword(states, ['editable']),
          'opacity-45 bg-gray-400 rounded-sm': editMode && type === 'slot',
          'slot-selected ring-2 ring-primary ring-offset-1 rounded-sm':
            isSelected,
        },
      )}
      style={{
        color: event.textColor || undefined,
        backgroundColor:
          event.display !== 'background'
            ? event.backgroundColor || event.borderColor
            : undefined,
        borderRadius: event.display !== 'background' ? '4px' : undefined,
      }}
    >
      {onToggleSelect &&
        (type === 'slot' || type === 'template') &&
        !containsKeyword(states, ['editable']) && (
          <button
            type="button"
            className={clsx(
              'absolute bottom-0.5 left-0.5 z-20 h-4 w-4 rounded border flex items-center justify-center transition-all cursor-pointer',
              isSelected
                ? 'bg-primary border-primary text-white'
                : 'border-white/60 bg-black/20 text-transparent hover:border-white hover:bg-black/30',
              isSelectionMode
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100',
            )}
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect(event.id)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Check className="w-3 h-3" strokeWidth={3} />
          </button>
        )}

      {locked && type === 'slot' && (
        <>
          <div
            className="absolute inset-0 z-10 pointer-events-none rounded-sm"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.12) 4px, rgba(0,0,0,0.12) 6px)',
            }}
          />
          <button
            type="button"
            data-lock-toggle
            className={clsx(
              'absolute top-0.5 left-0.5 z-10 p-0.5 rounded bg-black/40 text-white',
              onToggleLock
                ? 'pointer-events-auto cursor-pointer hover:bg-black/60'
                : 'pointer-events-none',
            )}
            onClick={(e) => {
              if (!onToggleLock) {
                return
              }
              e.stopPropagation()
              onToggleLock(event.id, false)
            }}
            onMouseDown={(e) => {
              if (!onToggleLock) {
                return
              }
              e.stopPropagation()
            }}
          >
            <Lock className="w-2.5 h-2.5" />
          </button>
        </>
      )}

      {onToggleLock &&
        !locked &&
        !containsKeyword(states, ['editable', 'individual', 'multiple']) &&
        type === 'slot' && (
          <Button
            data-lock-toggle
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

      <span
        className={clsx(
          'relative z-10 p-0.5 pointer-events-none',
          isRowLayout ? 'w-48 shrink-0' : '',
        )}
      >
        {view.type === 'dayGridDay' && event.start && event.end && (
          <div className="text-[0.65rem] whitespace-nowrap">
            {`${dayjs.utc(event.start).format('H:mm')} - ${dayjs.utc(event.end).format('H:mm')}`}
          </div>
        )}
        <div className="text-[0.6rem]">{event.title}</div>
        <div className="text-[0.6rem] font-semibold truncate">{thematic}</div>
      </span>

      {/* Individual */}
      {isIndividual && appointments && appointments.length > 0 && (
        <div
          className={clsx(
            isRowLayout
              ? 'flex-1 min-w-0 flex flex-row gap-0.5'
              : 'absolute inset-0',
          )}
        >
          {appointments.map((appointment: Appointment) => (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setOpenEventId?.(`appointment_${appointment.id}`)
              }}
              key={appointment.id}
              style={
                isRowLayout
                  ? { backgroundColor: appointmentColor }
                  : calculateAppointmentStyle(appointment)
              }
              className={clsx(
                'fc-event-hero z-10 cursor-pointer flex justify-start p-0.5 text-white truncate px-1 border border-white/30 rounded hover:brightness-90 transition-all',
                isRowLayout ? 'flex-1 min-w-0' : 'overflow-hidden',
              )}
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
        </div>
      )}

      {/* Multiple */}
      {isMultiple && appointments && appointments.length > 0 && (
        <div
          className={clsx(
            'flex-1 min-h-0 gap-0.5 overflow-y-auto',
            isRowLayout ? 'flex flex-row min-w-0' : 'flex flex-col mt-0.5',
          )}
        >
          {appointments.map((appointment: Appointment) => (
            <button
              type="button"
              key={appointment.id}
              onClick={(e) => {
                e.stopPropagation()
                setOpenEventId?.(`appointment_${appointment.id}`)
              }}
              style={calculateAppointmentStyle(appointment)}
              className={clsx(
                'fc-event-hero z-10 cursor-pointer flex-1 min-h-0 basis-0 flex justify-start p-0.5 text-white px-1 border border-white/30 rounded hover:brightness-90 transition-all',
                isRowLayout
                  ? 'flex-row min-w-0'
                  : 'flex-col mx-0.5 overflow-y-auto',
              )}
            >
              {appointment.appointmentPatients?.map(
                (appointmentPatient: AppointmentPatient, idx: number) => (
                  <div
                    key={appointmentPatient.patient.id}
                    className={clsx(
                      'flex-1',
                      idx > 0 &&
                        isRowLayout &&
                        'border-l border-white/30 pl-1 ml-1',
                      idx > 0 &&
                        !isRowLayout &&
                        'border-t border-white/30 pt-0.5 mt-0.5',
                    )}
                  >
                    <PatientName appointmentPatient={appointmentPatient} />
                  </div>
                ),
              )}
            </button>
          ))}
        </div>
      )}

      {/* Bouton + pour slots multiple vides */}
      {isMultiple &&
        !locked &&
        (!appointments || appointments.length === 0) && (
          <div className="z-100 cursor-pointer absolute inset-0 flex justify-center items-center">
            <Button variant="transparent" className="w-full h-full">
              <div className="p-1 rounded-full bg-neutral-50 text-primary group-hover:bg-neutral-300 transition-colors duration-200">
                <Plus className="w-4 h-4" />
              </div>
            </Button>
          </div>
        )}
    </div>
  )
}

function PatientName({
  appointmentPatient,
}: {
  appointmentPatient: AppointmentPatient
}) {
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
        <TooltipContent>{appointmentPatient.transmissionNotes}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}
