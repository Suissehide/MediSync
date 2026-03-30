import type {
  DateSelectArg,
  DateSpanApi,
  EventDropArg,
  ToolbarInput,
} from '@fullcalendar/core'
import frLocale from '@fullcalendar/core/locales/fr'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, {
  type EventResizeDoneArg,
} from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayjs, { type Dayjs } from 'dayjs'
import { CalendarIcon, CalendarOff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { usePlanningStore } from '../../../store/usePlanningStore.ts'
import type { Appointment } from '../../../types/appointment.ts'
import CalendarDatePickerButton from './calendarDatePickerButton.tsx'
import { EventContent } from './eventContent.tsx'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  color?: string
  textColor?: string
  backgroundColor?: string
  borderColor?: string
  extendedProps?: {
    type?: string
    templateID?: string
    soignant?: string
    location?: string
    states?: string[]
    appointments?: Appointment[]
  }
}

interface CalendarProps {
  events: CalendarEvent[]
  handleSelectEvent?: (arg: DateSelectArg) => void
  handleEditEvent?: (arg: EventDropArg | EventResizeDoneArg) => void
  handleClickEvent?: (eventID: string) => void
  handleDropEvent?: (pathwayTemplateID: string, startDate: string) => void
  handleOpenEvent?: (eventId: string) => void
  selectAllow?: (selectInfo: DateSpanApi) => boolean
  editMode?: boolean
  headerToolbar?: ToolbarInput
  editable?: boolean
  overlap?: boolean
  initialDate?: string
  forbiddenWeeks?: { id: string; startOfWeek: string }[]
  onForbiddenWeekCreate?: (date: string) => void
  onForbiddenWeekDelete?: (id: string) => void
  onDuplicate?: (eventId: string) => void
}

function Calendar({
  events,
  handleSelectEvent,
  handleEditEvent,
  handleDropEvent,
  handleClickEvent,
  handleOpenEvent,
  selectAllow,
  editMode,
  headerToolbar,
  editable = false,
  overlap = true,
  initialDate,
  forbiddenWeeks = [],
  onForbiddenWeekCreate,
  onForbiddenWeekDelete,
  onDuplicate,
}: CalendarProps) {
  const lastDropTimeRef = useRef<number>(0)
  const calendarRef = useRef<FullCalendar | null>(null)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [currentView, setCurrentView] = useState('timeGridWeek')
  const [currentViewStart, setCurrentViewStart] = useState<string>('')

  const showDayEmptyState = useMemo(() => {
    if (currentView !== 'dayGridDay' || !currentViewStart) return false
    const dayStart = dayjs(currentViewStart).startOf('day')
    const dayEnd = dayStart.endOf('day')
    return !events.some(
      (e) => dayjs(e.start).isBefore(dayEnd) && dayjs(e.end).isAfter(dayStart),
    )
  }, [currentView, currentViewStart, events])

  const forbiddenWeekEvents = useMemo(() => {
    return forbiddenWeeks.map((fw) => ({
      id: `forbidden_${fw.id}`,
      start: fw.startOfWeek,
      end: dayjs(fw.startOfWeek).add(7, 'day').toISOString(),
      display: 'background' as const,
      backgroundColor: 'rgba(239, 68, 68, 0.15)',
      borderColor: 'transparent',
      classNames: ['forbidden-week-bg'],
    }))
  }, [forbiddenWeeks])

  const handleOpenDatePicker = (ev: MouseEvent) => {
    const target = ev.currentTarget
    if (target instanceof HTMLElement) {
      setAnchorEl(target)
    }
  }

  const handleDateChange = (date: Dayjs | null) => {
    if (!date) {
      return
    }

    const api = calendarRef.current?.getApi() ?? null
    api?.gotoDate(date.toDate())
    setAnchorEl(null)
  }

  useEffect(() => {
    const button = document.querySelector('.fc-selectDateButton-button')
    if (button && !button.querySelector('svg')) {
      const root = createRoot(button)
      root.render(<CalendarIcon size={18} />)
    }
  }, [])

  const handleSelect = (dateSelectArg: DateSelectArg) => {
    handleSelectEvent?.(dateSelectArg)
  }

  const handleEventDrop = (eventDropArg: EventDropArg) => {
    handleEditEvent?.(eventDropArg)
  }

  const handleResize = (eventResizeStopArg: EventResizeDoneArg) => {
    handleEditEvent?.(eventResizeStopArg)
  }

  const clickedEventRef = useRef<string | null>(null)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) {
        return
      }

      const el = target.closest('.fc-event-hero')
      if (!el) {
        return
      }

      const eventID = el.getAttribute('data-event-id')
      if (!eventID) {
        return
      }

      clickedEventRef.current = eventID
    }

    const handleMouseUp = () => {
      const clicked = clickedEventRef.current
      if (!clicked) {
        return
      }

      clickedEventRef.current = null
      if (!isDraggingRef.current) {
        handleClickEvent?.(clicked)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleClickEvent])

  return (
    <div className={`${editMode ? 'edit-mode' : ''} h-full relative`}>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        initialDate={initialDate || dayjs().toISOString()}
        locale={frLocale}
        timeZone={'UTC'}
        weekends={false}
        allDaySlot={false}
        selectMirror={true}
        selectable={true}
        selectOverlap={true}
        unselectAuto={true}
        nowIndicator={true}
        customButtons={{
          selectDateButton: {
            text: '',
            click: handleOpenDatePicker,
          },
        }}
        headerToolbar={
          headerToolbar ?? {
            left: 'title',
            center: 'timeGridWeek,dayGridDay,listWeek',
            right: 'selectDateButton prev,next today',
          }
        }
        titleFormat={{
          day: '2-digit',
          month: 'long',
        }}
        dayHeaderFormat={{
          weekday: 'short',
          day: 'numeric',
        }}
        slotLabelFormat={(arg) => {
          const hour = arg.date.hour.toString()
          const minute = arg.date.minute.toString().padStart(2, '0')
          return minute === '00' ? `${hour}h` : `${hour}:${minute}`
        }}
        height="100%"
        slotMinTime="06:00:00"
        slotDuration="00:30:00"
        slotLabelInterval="01:00"
        snapDuration="00:15:00"
        editable={editable}
        select={handleSelect}
        dateClick={(info) => {
          if (!onForbiddenWeekCreate && !onForbiddenWeekDelete) return
          const clickedDate = dayjs(info.date)
          const matchingForbiddenWeek = forbiddenWeeks.find((fw) => {
            const start = dayjs(fw.startOfWeek)
            return (
              (clickedDate.isSame(start) || clickedDate.isAfter(start)) &&
              clickedDate.isBefore(start.add(7, 'day'))
            )
          })
          if (matchingForbiddenWeek) {
            onForbiddenWeekDelete?.(matchingForbiddenWeek.id)
          } else {
            onForbiddenWeekCreate?.(info.dateStr)
          }
        }}
        eventDrop={handleEventDrop}
        eventResize={handleResize}
        eventDragStart={() => {
          isDraggingRef.current = true
        }}
        eventDragStop={() => {
          setTimeout(() => {
            isDraggingRef.current = false
          }, 0)
        }}
        eventResizeStart={() => {
          isDraggingRef.current = true
        }}
        eventResizeStop={() => {
          setTimeout(() => {
            isDraggingRef.current = false
          }, 0)
        }}
        events={[...events, ...forbiddenWeekEvents]}
        eventOverlap={overlap}
        slotEventOverlap={overlap}
        eventContent={(eventContent) => (
          <EventContent
            setOpenEventId={handleOpenEvent}
            eventContent={eventContent}
            editMode={editMode}
            onDuplicate={onDuplicate}
          />
        )}
        noEventsContent={() => (
          <NoEventsState label="Aucune séance planifiée cette semaine" />
        )}
        datesSet={(arg) => {
          setCurrentView(arg.view.type)
          setCurrentViewStart(arg.view.currentStart.toISOString())
          usePlanningStore.getState().setPlanningDates({
            currentDate: arg.startStr,
            viewStart: arg.view.currentStart.toISOString(),
            viewEnd: arg.view.currentEnd.toISOString(),
          })
        }}
        selectAllow={selectAllow}
        eventReceive={undefined}
        drop={(info) => {
          const now = Date.now()
          const THROTTLE_MS = 500
          if (now - lastDropTimeRef.current < THROTTLE_MS) {
            return
          }
          lastDropTimeRef.current = now

          const pathwayId = info.draggedEl.getAttribute('data-pathway-id')
          const startDate = info.date
          const weekStart = dayjs(startDate).isoWeekday(1).utc().startOf('day')
          if (pathwayId) {
            handleDropEvent?.(pathwayId, weekStart.toISOString())
          }
        }}
        eventDidMount={(info) => {
          if (info.event.display === 'background') {
            const overlapping = events.filter(
              (e) =>
                e.extendedProps?.type === 'slot' &&
                e.start &&
                e.end &&
                info.event.start &&
                info.event.end &&
                dayjs(e.start).isBefore(dayjs(info.event.end)) &&
                dayjs(e.end).isAfter(dayjs(info.event.start)),
            )

            if (overlapping.length > 1) {
              const index = overlapping.findIndex((s) => s.id === info.event.id)
              const width = 100 / overlapping.length

              info.el.style.width = index === 0 ? '100%' : `${width}%`
              info.el.style.left = `${index * width}%`
            }
          }
        }}
      />

      {showDayEmptyState && (
        <div className="absolute inset-x-0 bottom-0 top-[68px] flex items-center justify-center pointer-events-none z-10">
          <NoEventsState label="Aucune séance planifiée ce jour" />
        </div>
      )}

      <CalendarDatePickerButton
        anchorEl={anchorEl}
        setAnchorEl={setAnchorEl}
        onChange={handleDateChange}
      />
    </div>
  )
}

function NoEventsState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="flex items-center justify-center h-12 w-12 rounded-full bg-card border border-border">
        <CalendarOff className="h-5 w-5 text-text-light" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-text-dark">Aucune séance</p>
        <p className="text-xs text-text-light mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default Calendar
