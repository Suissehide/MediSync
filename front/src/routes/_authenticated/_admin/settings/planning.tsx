import type { DateSelectArg, EventDropArg } from '@fullcalendar/core'
import frLocale from '@fullcalendar/core/locales/fr'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, {
  type EventResizeDoneArg,
} from '@fullcalendar/interaction'
import multiMonthPlugin from '@fullcalendar/multimonth'
import FullCalendar from '@fullcalendar/react'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { CalendarDays, GanttChart, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import Calendar, {
  type CalendarEvent,
} from '../../../../components/custom/Calendar/calendar.tsx'
import AddSlotForm from '../../../../components/custom/popup/addSlotForm.tsx'
import { CreateForbiddenWeekForm } from '../../../../components/custom/popup/createForbiddenWeekForm.tsx'
import { DeleteForbiddenWeekForm } from '../../../../components/custom/popup/deleteForbiddenWeekForm.tsx'
import EventSheet from '../../../../components/custom/sheet/eventSheet.tsx'
import EventTemplateSheet from '../../../../components/custom/sheet/eventTemplateSheet.tsx'
import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import { Button } from '../../../../components/ui/button.tsx'
import {
  PopoverAnchor,
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverRoot,
} from '../../../../components/ui/popover.tsx'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '../../../../components/ui/toggle-group.tsx'
import {
  buildCalendarEventsFromSlots,
  buildCalendarEventsFromSlotTemplates,
  buildPathwayEvents,
} from '../../../../libs/utils.ts'
import {
  useForbiddenWeekMutations,
  useForbiddenWeekQueries,
} from '../../../../queries/useForbiddenWeek.ts'
import {
  usePathwayMutations,
  usePathwayQueries,
} from '../../../../queries/usePathway.ts'
import { usePathwayTemplateQueries } from '../../../../queries/usePathwayTemplate.ts'
import {
  useAllSlotsQuery,
  useSlotMutations,
} from '../../../../queries/useSlot.ts'
import { useSlotTemplateMutations } from '../../../../queries/useSlotTemplate.ts'
import { usePathwayTemplateEditStore } from '../../../../store/usePathwayTemplateEditStore.ts'
import type { CreateSlotParamsWithTemplateData } from '../../../../types/slot.ts'

export const Route = createFileRoute(
  '/_authenticated/_admin/settings/planning',
)({
  component: Planning,
})

function Planning() {
  const { slots } = useAllSlotsQuery()
  const { pathways } = usePathwayQueries()
  const { pathwayTemplates } = usePathwayTemplateQueries()
  const { createSlot, updateSlot, deleteSlot } = useSlotMutations()
  const { instantiatePathway, deletePathway } = usePathwayMutations()
  const lastDropTimeRef = useRef<number>(0)
  const { createSlotTemplate, updateSlotTemplate, deleteSlotTemplate } =
    useSlotTemplateMutations()
  const { forbiddenWeeks } = useForbiddenWeekQueries()
  const { createForbiddenWeek, deleteForbiddenWeek } =
    useForbiddenWeekMutations()

  const [createForbiddenWeekDate, setCreateForbiddenWeekDate] = useState<
    string | null
  >(null)
  const [deleteForbiddenWeekTarget, setDeleteForbiddenWeekTarget] = useState<{
    id: string
    startOfWeek: string
  } | null>(null)
  const editMode = usePathwayTemplateEditStore((state) => state.editMode)
  const startDate = usePathwayTemplateEditStore((state) => state.startDate)
  const currentPathwayTemplateId = usePathwayTemplateEditStore(
    (state) => state.currentPathwayTemplate?.id,
  )
  const currentPathwayTemplate = pathwayTemplates?.find(
    (template) => template.id === currentPathwayTemplateId,
  )

  const [view, setView] = useState<'calendar' | 'timeline'>('calendar')
  const [isForbiddenWeekMode, setIsForbiddenWeekMode] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    title: string
    anchor: { getBoundingClientRect: () => DOMRect }
  } | null>(null)
  const [openEventId, setOpenEventId] = useState('')
  const [openCreateSlotModal, setOpenCreateSlotModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<DateSelectArg | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [eventTemplates, setEventTemplates] = useState<CalendarEvent[]>([])

  useEffect(() => {
    if (slots) {
      setEvents(
        buildCalendarEventsFromSlots(
          slots,
          editMode ? ['editable'] : ['default'],
        ),
      )
    }
  }, [slots, editMode])

  useEffect(() => {
    if (currentPathwayTemplate?.slotTemplates) {
      setEventTemplates(
        buildCalendarEventsFromSlotTemplates(
          currentPathwayTemplate?.slotTemplates,
          startDate,
        ),
      )
    }
  }, [currentPathwayTemplate, startDate])

  const handleInstantiatePathway = (
    pathwayTemplateID: string,
    startDate: string,
  ) => {
    instantiatePathway.mutate({
      pathwayTemplateID,
      startDate,
    })
  }

  const handleSelectSlot = (dateSelectArg: DateSelectArg) => {
    setSelectedDate(dateSelectArg)
    setOpenCreateSlotModal(true)
  }

  const handleCreateSlot = (newSlot: CreateSlotParamsWithTemplateData) => {
    if (editMode) {
      const offsetDays = dayjs(newSlot.startDate).diff(dayjs(startDate), 'day')
      const slotTemplate = {
        startTime: newSlot.startDate,
        endTime: newSlot.endDate,
        offsetDays,
        thematic: newSlot.slotTemplate.thematic,
        location: newSlot.slotTemplate.location,
        description: newSlot.slotTemplate.description,
        color: newSlot.slotTemplate.color,
        isIndividual: newSlot.slotTemplate.isIndividual,
        soignantID: newSlot.slotTemplate.soignantID,
        templateID: currentPathwayTemplate?.id,
      }
      createSlotTemplate.mutate(slotTemplate, {
        onSuccess: () => {
          setOpenCreateSlotModal(false)
        },
      })
    } else {
      createSlot.mutate(newSlot)
      setOpenCreateSlotModal(false)
    }
  }

  const handleEditSlot = (eventDropArg: EventDropArg | EventResizeDoneArg) => {
    const {
      id,
      startStr: start,
      endStr: end,
      extendedProps,
    } = eventDropArg.event

    const slotId = id.replace(/^.*?_/, '')

    if (editMode) {
      const newOffsetDays = dayjs(start).diff(dayjs(startDate), 'day')

      updateSlotTemplate.mutate({
        id: slotId,
        offsetDays: newOffsetDays,
        startTime: start,
        endTime: end,
      })
    } else {
      updateSlot.mutate({
        id: slotId,
        startDate: start,
        endDate: end,
        slotTemplate: {
          id: extendedProps.templateID,
          startTime: start,
          endTime: end,
        },
      })
    }
  }

  const handleDeleteEvent = (id: string) => {
    if (editMode) {
      deleteSlotTemplate.mutate(id)
    } else {
      setEvents((prev) => prev.filter((event) => event.id !== id))
      deleteSlot.mutate(id)
    }
  }

  const handleDuplicateSlot = (eventId: string) => {
    if (eventId.startsWith('slot_')) {
      const slotId = eventId.replace('slot_', '')
      const slot = slots?.find((s) => s.id === slotId)
      if (!slot) return
      const duplicateParams: CreateSlotParamsWithTemplateData = {
        startDate: slot.startDate,
        endDate: slot.endDate,
        slotTemplate: {
          startTime: slot.startDate,
          endTime: slot.endDate,
          thematic: slot.slotTemplate.thematic,
          location: slot.slotTemplate.location,
          description: slot.slotTemplate.description,
          color: slot.slotTemplate.color,
          isIndividual: slot.slotTemplate.isIndividual,
          soignantID: slot.slotTemplate.soignant?.id ?? '',
        },
      }
      createSlot.mutate(duplicateParams)
    } else if (eventId.startsWith('template_')) {
      const templateId = eventId.replace('template_', '')
      const slotTemplate = currentPathwayTemplate?.slotTemplates?.find(
        (t) => t.id === templateId,
      )
      if (!slotTemplate || !currentPathwayTemplate) return
      createSlotTemplate.mutate({
        startTime: slotTemplate.startTime,
        endTime: slotTemplate.endTime,
        offsetDays: slotTemplate.offsetDays,
        thematic: slotTemplate.thematic,
        location: slotTemplate.location,
        description: slotTemplate.description,
        color: slotTemplate.color,
        isIndividual: slotTemplate.isIndividual,
        soignantID: slotTemplate.soignant?.id ?? '',
        templateID: currentPathwayTemplate.id,
      })
    }
  }

  const handleForbiddenWeekCreate = (date: string) => {
    setCreateForbiddenWeekDate(date)
  }

  const handleForbiddenWeekDelete = (id: string) => {
    const week = forbiddenWeeks?.find((fw) => fw.id === id)
    if (week) {
      setDeleteForbiddenWeekTarget({
        id: week.id,
        startOfWeek: week.startOfWeek,
      })
    }
  }

  const mergedEvents = useMemo(() => {
    return editMode ? [...events, ...(eventTemplates ?? [])] : events
  }, [events, eventTemplates, editMode])

  useEffect(() => {
    if (editMode) {
      setView('calendar')
    }
  }, [editMode])

  const pathwayEvents = useMemo<CalendarEvent[]>(() => {
    if (!pathways) {
      return []
    }
    return buildPathwayEvents(pathways)
  }, [pathways])

  const forbiddenWeekBackgroundEvents = useMemo(() => {
    return (forbiddenWeeks ?? []).map((fw) => ({
      id: `forbidden_${fw.id}`,
      start: dayjs.utc(fw.startOfWeek).format('YYYY-MM-DD'),
      end: dayjs.utc(fw.startOfWeek).add(7, 'day').format('YYYY-MM-DD'),
      display: 'background' as const,
      backgroundColor: 'rgba(239, 68, 68, 0.20)',
      classNames: ['forbidden-week-bg'],
    }))
  }, [forbiddenWeeks])

  const handleTimelineDateClick = (info: { dateStr: string }) => {
    if (!isForbiddenWeekMode) {
      return
    }
    const clickedDate = dayjs(info.dateStr)
    const matchingForbiddenWeek = (forbiddenWeeks ?? []).find((fw) => {
      const start = dayjs(fw.startOfWeek)
      return (
        (clickedDate.isSame(start) || clickedDate.isAfter(start)) &&
        clickedDate.isBefore(start.add(7, 'day'))
      )
    })
    if (matchingForbiddenWeek) {
      handleForbiddenWeekDelete(matchingForbiddenWeek.id)
    } else {
      handleForbiddenWeekCreate(info.dateStr)
    }
  }

  const isSlot = openEventId.startsWith('slot_')
  const isTemplate = openEventId.startsWith('template_')
  const slotId = openEventId.replace(/^.*?_/, '')

  return (
    <DashboardLayout
      components={['pathway']}
      quickActions={[
        <Button
          key="forbidden-week-mode"
          variant="gradient"
          className={`w-full transition duration-200
            ${isForbiddenWeekMode ? 'border border-border-dark' : ''}`}
          onClick={() => {
            if (view !== 'timeline') {
              setView('timeline')
            }
            setIsForbiddenWeekMode((prev) => !prev)
          }}
        >
          Planifier semaines interdites
        </Button>,
      ]}
    >
      <div className="flex-1 bg-background rounded-lg flex flex-col w-full gap-4">
        <div className="px-6 pt-6 flex items-center justify-between">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Planning
          </h1>

          <div className="flex justify-end">
            {!editMode && (
              <ToggleGroup
                value={view}
                onValueChange={(v: string) => {
                  if (v) {
                    setView(v as 'calendar' | 'timeline')
                    if (v !== 'timeline') {
                      setIsForbiddenWeekMode(false)
                    }
                  }
                }}
              >
                <ToggleGroupItem value="calendar">
                  <CalendarDays className="h-4 w-4" />
                  Calendrier
                </ToggleGroupItem>
                <ToggleGroupItem value="timeline">
                  <GanttChart className="h-4 w-4" />
                  Timeline
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
        </div>

        <div className="flex flex-col h-full">
          <div className="flex-1 min-h-0 overflow-hidden">
            {view === 'calendar' ? (
              <Calendar
                events={mergedEvents}
                handleSelectEvent={handleSelectSlot}
                handleEditEvent={handleEditSlot}
                handleDropEvent={handleInstantiatePathway}
                handleClickEvent={setOpenEventId}
                handleOpenEvent={setOpenEventId}
                editMode={editMode}
                editable={true}
                forbiddenWeeks={forbiddenWeeks ?? []}
                onDuplicate={handleDuplicateSlot}
              />
            ) : (
              <div
                className={`h-full ${isForbiddenWeekMode ? 'forbidden-week-mode' : ''}`}
              >
                <FullCalendar
                  plugins={[dayGridPlugin, multiMonthPlugin, interactionPlugin]}
                  initialView="dayGridYear"
                  locale={frLocale}
                  timeZone="UTC"
                  weekends={true}
                  headerToolbar={{
                    left: 'title',
                    center: 'dayGridYear,multiMonthYear',
                    right: 'prev,next today',
                  }}
                  buttonText={{
                    dayGridYear: 'Liste',
                    multiMonthYear: 'Grille',
                  }}
                  multiMonthMinWidth={600}
                  dayMaxEvents={false}
                  dayMaxEventRows={false}
                  height="100%"
                  events={[...pathwayEvents, ...forbiddenWeekBackgroundEvents]}
                  editable={false}
                  selectable={false}
                  droppable={true}
                  dateClick={handleTimelineDateClick}
                  drop={(info) => {
                    const now = Date.now()
                    if (now - lastDropTimeRef.current < 500) {
                      return
                    }
                    lastDropTimeRef.current = now
                    const pathwayId =
                      info.draggedEl.getAttribute('data-pathway-id')
                    const weekStart = dayjs(info.date)
                      .isoWeekday(1)
                      .utc()
                      .startOf('day')
                    if (pathwayId) {
                      handleInstantiatePathway(
                        pathwayId,
                        weekStart.toISOString(),
                      )
                    }
                  }}
                  eventClick={(info) => {
                    if (isForbiddenWeekMode) {
                      return
                    }
                    if (info.event.id.startsWith('forbidden_')) {
                      return
                    }
                    const x = info.jsEvent.clientX
                    const rect = info.el.getBoundingClientRect()
                    const y = rect.top + rect.height / 2
                    setDeleteTarget({
                      id: info.event.id,
                      title: info.event.title,
                      anchor: {
                        getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
                      },
                    })
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <PopoverRoot
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null)
            }
          }}
        >
          {deleteTarget && (
            <PopoverAnchor virtualRef={{ current: deleteTarget.anchor }} />
          )}
          <PopoverContent
            side="top"
            align="center"
            sideOffset={10}
            className="w-56 p-0 shadow-lg"
          >
            <PopoverArrow
              width={14}
              height={7}
              style={{
                fill: 'var(--popover)',
                stroke: 'var(--border)',
                strokeWidth: 1,
              }}
            />

            <div className="px-4 pt-4 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-light">
                    Supprimer le parcours
                  </p>
                  <p className="mt-1 text-sm font-medium text-text-dark leading-snug line-clamp-2">
                    {deleteTarget?.title}
                  </p>
                </div>
                <PopoverClose className="mt-0.5 shrink-0 rounded p-0.5 text-text-light hover:text-text hover:bg-muted transition-colors cursor-pointer">
                  <X className="h-3.5 w-3.5" />
                </PopoverClose>
              </div>
            </div>

            <div className="mx-4 border-t border-border" />

            <div className="flex gap-2 p-3">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={() => setDeleteTarget(null)}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1 h-8 text-xs gap-1.5"
                onClick={() => {
                  if (deleteTarget) {
                    deletePathway.mutate(deleteTarget.id)
                    setDeleteTarget(null)
                  }
                }}
              >
                <Trash2 className="h-3 w-3" />
                Supprimer
              </Button>
            </div>
          </PopoverContent>
        </PopoverRoot>

        <AddSlotForm
          open={openCreateSlotModal}
          setOpen={setOpenCreateSlotModal}
          startDate={selectedDate?.startStr}
          endDate={selectedDate?.endStr}
          color={currentPathwayTemplate?.color}
          handleCreateSlot={handleCreateSlot}
        />

        <EventSheet
          open={isSlot && !editMode}
          setOpen={setOpenEventId}
          eventID={slotId}
          handleDeleteEvent={handleDeleteEvent}
        />

        <EventTemplateSheet
          open={isTemplate && editMode}
          setOpen={setOpenEventId}
          eventTemplateID={slotId}
          handleDeleteEvent={handleDeleteEvent}
        />

        <CreateForbiddenWeekForm
          open={!!createForbiddenWeekDate}
          setOpen={(open) => {
            if (!open) {
              setCreateForbiddenWeekDate(null)
            }
          }}
          date={createForbiddenWeekDate}
          onConfirm={(date) => {
            createForbiddenWeek.mutate(date, {
              onSuccess: () => setCreateForbiddenWeekDate(null),
            })
          }}
          loading={createForbiddenWeek.isPending}
        />

        <DeleteForbiddenWeekForm
          open={!!deleteForbiddenWeekTarget}
          setOpen={(open) => {
            if (!open) {
              setDeleteForbiddenWeekTarget(null)
            }
          }}
          startOfWeek={deleteForbiddenWeekTarget?.startOfWeek ?? null}
          onConfirm={() => {
            if (deleteForbiddenWeekTarget) {
              deleteForbiddenWeek.mutate(deleteForbiddenWeekTarget.id, {
                onSuccess: () => setDeleteForbiddenWeekTarget(null),
              })
            }
          }}
          loading={deleteForbiddenWeek.isPending}
        />
      </div>
    </DashboardLayout>
  )
}
