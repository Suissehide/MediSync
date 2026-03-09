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
import EventSheet from '../../../../components/custom/sheet/eventSheet.tsx'
import EventTemplateSheet from '../../../../components/custom/sheet/eventTemplateSheet.tsx'
import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import { Button } from '../../../../components/ui/button.tsx'
import {
  PopoverAnchor,
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
  usePathwayMutations,
  usePathwayQueries,
} from '../../../../queries/usePathway.ts'
import { usePathwayTemplateQueries } from '../../../../queries/usePathwayTemplate.ts'
import {
  useAllSlotsQuery,
  useSlotMutations,
} from '../../../../queries/useSlot.ts'
import { useSlotTemplateMutations } from '../../../../queries/useSlotTemplate.ts'
import { CreateForbiddenWeekForm } from '../../../../components/custom/popup/createForbiddenWeekForm.tsx'
import { DeleteForbiddenWeekForm } from '../../../../components/custom/popup/deleteForbiddenWeekForm.tsx'
import {
  useForbiddenWeekMutations,
  useForbiddenWeekQueries,
} from '../../../../queries/useForbiddenWeek.ts'
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
  const { createForbiddenWeek, deleteForbiddenWeek } = useForbiddenWeekMutations()

  const [createForbiddenWeekDate, setCreateForbiddenWeekDate] = useState<string | null>(null)
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

  const handleForbiddenWeekCreate = (date: string) => {
    setCreateForbiddenWeekDate(date)
  }

  const handleForbiddenWeekDelete = (id: string) => {
    const week = forbiddenWeeks?.find((fw) => fw.id === id)
    if (week) {
      setDeleteForbiddenWeekTarget({ id: week.id, startOfWeek: week.startOfWeek })
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

  const isSlot = openEventId.startsWith('slot_')
  const isTemplate = openEventId.startsWith('template_')
  const slotId = openEventId.replace(/^.*?_/, '')

  return (
    <DashboardLayout components={['pathway']}>
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
                onForbiddenWeekCreate={handleForbiddenWeekCreate}
                onForbiddenWeekDelete={handleForbiddenWeekDelete}
              />
            ) : (
              <FullCalendar
                plugins={[dayGridPlugin, multiMonthPlugin, interactionPlugin]}
                initialView="multiMonthYear"
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
                events={pathwayEvents}
                editable={false}
                selectable={false}
                droppable={true}
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
                    handleInstantiatePathway(pathwayId, weekStart.toISOString())
                  }
                }}
                eventClick={(info) => {
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
          <PopoverContent side="top" align="center" sideOffset={0}>
            <PopoverClose className="absolute top-2 right-2 rounded-full p-1 text-text-light hover:text-text hover:bg-muted cursor-pointer transition-colors">
              <X className="h-3.5 w-3.5" />
            </PopoverClose>

            <div className="flex items-center gap-3 mb-6 pr-4">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-destructive/10 shrink-0">
                <Trash2 className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text">
                  Supprimer ce parcours ?
                </p>
                <p className="text-xs text-text-light mt-0.5">
                  {deleteTarget?.title}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(null)}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (deleteTarget) {
                    deletePathway.mutate(deleteTarget.id)
                    setDeleteTarget(null)
                  }
                }}
              >
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
          setOpen={(open) => { if (!open) setCreateForbiddenWeekDate(null) }}
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
          setOpen={(open) => { if (!open) setDeleteForbiddenWeekTarget(null) }}
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
