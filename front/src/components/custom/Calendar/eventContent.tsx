import type { EventContentArg } from '@fullcalendar/core'
import { MoreVertical, Plus } from 'lucide-react'
import { Button } from '../../ui/button.tsx'
import { clsx } from 'clsx'
import { containsKeyword } from '../../../libs/utils.ts'

type Props = {
  setOpenEventId: (eventId: string) => void
  eventContent: EventContentArg
}

export const EventContent = ({ eventContent, setOpenEventId }: Props) => {
  const { event, timeText } = eventContent
  const { states } = event.extendedProps

  return (
    <div
      data-event-id={event.id}
      className={clsx(
        'fc-event-hero relative group h-full w-full p-0 user-select-none',
        {
          'pointer-events-none p-1': containsKeyword(states, ['editable']),
          'p-1': containsKeyword(states, ['fillable']),
          'text-black': containsKeyword(states, ['multiple']),
        },
      )}
    >
      {!containsKeyword(states, ['multiple']) && (
        <div className="text-[0.65rem] whitespace-nowrap">{timeText}</div>
      )}
      <div className="text-xs">{event.title}</div>

      {containsKeyword(states, ['multiple']) && (
        <div className="z-100 cursor-pointer absolute inset-0 flex justify-center items-center">
          <Button variant="transparent" className="w-full h-full">
            <div className="p-2 rounded-full bg-primary text-neutral-50 hover:bg-primary/70 transition-colors duration-300">
              <Plus className="w-6 h-6" />
            </div>
          </Button>
        </div>
      )}

      {containsKeyword(states, ['default']) && (
        <div className="transition opacity-0 group-hover:opacity-100">
          <Button
            onClick={() => setOpenEventId(event.id)}
            variant="transparent"
            size="icon-sm"
            className="group/trigger absolute left-0 bottom-1"
          >
            <MoreVertical className="w-4 h-4 text-white cursor-pointer transition group-hover/trigger:text-gray-800" />
          </Button>
        </div>
      )}
    </div>
  )
}
