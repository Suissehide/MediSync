import type { EventContentArg } from '@fullcalendar/core'
import { Plus } from 'lucide-react'
import { Button } from '../../ui/button.tsx'
import { clsx } from 'clsx'
import { containsKeyword } from '../../../libs/utils.ts'
import type { Patient } from '../../../types/patient.ts'

type Props = {
  setOpenEventId: (eventId: string) => void
  eventContent: EventContentArg
}

export const EventContent = ({ eventContent, setOpenEventId }: Props) => {
  const { event, timeText } = eventContent
  const { states } = event.extendedProps

  return (
    <div
      {...(event.id ? { 'data-event-id': event.id } : {})}
      {...(containsKeyword(states, ['default']) ||
      event.extendedProps.type === 'appointment'
        ? { onClick: () => setOpenEventId(event.id) }
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
          <div className="text-xs">{event.title}</div>

          {event.extendedProps.type === 'appointment' && (
            <div className="text-xs space-y-0.5 mt-0.5 max-h-20 overflow-y-auto">
              {event.extendedProps.patients?.length > 0 ? (
                event.extendedProps.patients.map((patient: Patient) => (
                  <div
                    key={patient.id}
                    className="text-[0.7rem] text-neutral-200 truncate"
                  >
                    {patient.firstName} {patient.lastName}
                  </div>
                ))
              ) : (
                <div className="text-xs italic text-neutral-200">
                  Aucun patient
                </div>
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
