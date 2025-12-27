import type { EventContentArg } from '@fullcalendar/core'
import { clsx } from 'clsx'
import { Plus } from 'lucide-react'

import { containsKeyword } from '../../../libs/utils.ts'
import type { AppointmentPatient } from '../../../types/appointmentPatient.ts'
import { Button } from '../../ui/button.tsx'

type Props = {
  setOpenEventId?: (eventId: string) => void
  eventContent: EventContentArg
}

export const EventContent = ({ eventContent, setOpenEventId }: Props) => {
  const { event, timeText } = eventContent
  const { states } = event.extendedProps

  return (
    <div
      {...(event.id ? { 'data-event-id': event.id } : {})}
      {...(!containsKeyword(states, ['editable']) &&
      (event.extendedProps.type === 'slot' ||
        event.extendedProps.type === 'appointment')
        ? {
            onClick: () =>
              setOpenEventId?.(`${event.extendedProps.type}_${event.id}`),
          }
        : {})}
      className={clsx(
        'fc-event-hero relative group h-full w-full p-0 user-select-none',
        {
          'pointer-events-none p-1': containsKeyword(states, ['editable']),
          'p-1': containsKeyword(states, ['fillable']),
          'text-black': containsKeyword(states, ['multiple']),
        },
      )}
    >
      {!containsKeyword(states, ['multiple']) &&
        event.extendedProps.type !== 'appointment' && (
          <div className="text-[0.65rem] whitespace-nowrap">{timeText}</div>
        )}

      {!containsKeyword(states, ['multiple', 'individual']) && (
        <>
          <div className="text-[0.6rem] text-neutral-100">{event.title}</div>

          {event.extendedProps.type === 'appointment' && (
            <div className="text-xs space-y-0.5 mt-0.5 max-h-20 overflow-y-auto">
              {event.extendedProps.appointmentPatients?.length > 0 ? (
                event.extendedProps.appointmentPatients.map(
                  (appointmentPatient: AppointmentPatient) => (
                    <div
                      key={appointmentPatient.patient.id}
                      className="text-xs text-white truncate"
                    >
                      {appointmentPatient.patient.firstName}{' '}
                      {appointmentPatient.patient.lastName}
                    </div>
                  ),
                )
              ) : (
                <div className="text-xs italic text-white">Aucun patient</div>
              )}
            </div>
          )}
        </>
      )}

      {containsKeyword(states, ['multiple']) &&
        event.extendedProps.appointments?.length === 0 && (
          <div className="z-100 cursor-pointer absolute inset-0 flex justify-center items-center">
            <Button variant="transparent" className="w-full h-full">
              <div className="p-2 rounded-full bg-neutral-50 text-primary hover:bg-neutral-400 transition-colors duration-300">
                <Plus className="w-6 h-6" />
              </div>
            </Button>
          </div>
        )}
    </div>
  )
}
