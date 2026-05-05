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
import { CalendarDays, CheckSquare, Copy, GanttChart, MoveRight, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Calendar, {
  type CalendarEvent,
} from '../../../../components/custom/Calendar/calendar.tsx'
import AddSlotForm from '../../../../components/custom/popup/addSlotForm.tsx'
import { BulkDuplicateForm } from '../../../../components/custom/popup/bulkDuplicateForm.tsx'
import { BulkMoveForm } from '../../../../components/custom/popup/bulkMoveForm.tsx'
import { ConfirmDeleteForm } from '../../../../components/custom/popup/confirmDeleteForm.tsx'
import { CreateForbiddenWeekForm } from '../../../../components/custom/popup/createForbiddenWeekForm.tsx'
import { DeleteForbiddenWeekForm } from '../../../../components/custom/popup/deleteForbiddenWeekForm.tsx'
import EventSheet from '../../../../components/custom/sheet/eventSheet.tsx'
import EventTemplateSheet from '../../../../components/custom/sheet/eventTemplateSheet.tsx'
import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import { Button } from '../../../../components/ui/button.tsx'
import { Select } from '../../../../components/ui/select.tsx'
import { TOAST_SEVERITY } from '../../../../constants/ui.constant.ts'
import { useToast } from '../../../../hooks/useToast.ts'
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
import { usePlanningStore } from '../../../../store/usePlanningStore.ts'
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
  const { toast } = useToast()
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
  const [hoveredPathway, setHoveredPathway] = useState<{
    title: string
    start: string
    end: string
    x: number
    y: number
  } | null>(null)
  const [openEventId, setOpenEventId] = useState('')
  const [deleteConfirmEventId, setDeleteConfirmEventId] = useState<string | null>(null)
  const [openCreateSlotModal, setOpenCreateSlotModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<DateSelectArg | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [eventTemplates, setEventTemplates] = useState<CalendarEvent[]>([])
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState('')
  const [duplicateWeekDate, setDuplicateWeekDate] = useState<dayjs.Dayjs | null>(null)
  const [duplicateTargetWeek, setDuplicateTargetWeek] = useState(1)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [moveWeekDate, setMoveWeekDate] = useState<dayjs.Dayjs | null>(null)
  const [moveTargetWeek, setMoveTargetWeek] = useState(1)
  const [showMoveModal, setShowMoveModal] = useState(false)

  const handleToggleSelect = useCallback((eventId: string) => {
    setSelectedSlotIds((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) {
        next.delete(eventId)
      } else {
        next.add(eventId)
      }
      return next
    })
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectedSlotIds(new Set())
    setBulkAction('')
  }, [])

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
      const slot = slots?.find((s) => s.id === id)
      if (slot && slot.appointments && slot.appointments.length > 0) {
        toast({
          title: 'Suppression impossible',
          message: 'Ce créneau contient des rendez-vous déjà programmés. Veuillez d\'abord supprimer les rendez-vous avant de supprimer le créneau.',
          severity: TOAST_SEVERITY.ERROR,
        })
        return
      }
      setEvents((prev) => prev.filter((event) => event.id !== id))
      deleteSlot.mutate(id)
    }
  }

  const handleDeleteHoverSlot = (eventId: string) => {
    setDeleteConfirmEventId(eventId)
  }

  const handleConfirmDeleteHoverSlot = () => {
    if (!deleteConfirmEventId) { return }
    const id = deleteConfirmEventId.replace(/^.*?_/, '')
    handleDeleteEvent(id)
    setDeleteConfirmEventId(null)
  }

  const handleDuplicateSlot = (eventId: string) => {
    if (eventId.startsWith('slot_')) {
      const slotId = eventId.replace('slot_', '')
      const slot = slots?.find((s) => s.id === slotId)
      if (!slot) { return }
      const duplicateParams: CreateSlotParamsWithTemplateData = {
        startDate: slot.startDate,
        endDate: slot.endDate,
        slotTemplate: {
          startTime: slot.startDate,
          endTime: slot.endDate,
          offsetDays: 0,
          thematic: slot.slotTemplate.thematic,
          location: slot.slotTemplate.location,
          description: slot.slotTemplate.description,
          color: slot.slotTemplate.color,
          isIndividual: slot.slotTemplate.isIndividual,
          capacity: slot.slotTemplate.capacity ?? 1,
          soignantID: slot.slotTemplate.soignant?.id ?? '',
        },
      }
      createSlot.mutate(duplicateParams)
    } else if (eventId.startsWith('template_')) {
      const templateId = eventId.replace('template_', '')
      const slotTemplate = currentPathwayTemplate?.slotTemplates?.find(
        (t) => t.id === templateId,
      )
      if (!slotTemplate || !currentPathwayTemplate) { return }
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

  const handleToggleLock = (eventId: string, locked: boolean) => {
    if (!eventId.startsWith('slot_')) { return }
    const slotId = eventId.replace('slot_', '')
    updateSlot.mutate({ id: slotId, locked })
  }

  const handleBulkDuplicate = (targetDate: dayjs.Dayjs) => {
    const targetWeekStart = targetDate.isoWeekday(1).utc().startOf('day')

    for (const eventId of selectedSlotIds) {
      if (!eventId.startsWith('slot_')) continue
      const slotId = eventId.replace('slot_', '')
      const slot = slots?.find((s) => s.id === slotId)
      if (!slot) continue

      const slotStart = dayjs(slot.startDate)
      const slotWeekStart = slotStart.isoWeekday(1).utc().startOf('day')
      const dayOffset = slotStart.diff(slotWeekStart, 'day')
      const timeOfDay = slotStart.format('HH:mm:ss')
      const duration = dayjs(slot.endDate).diff(slotStart, 'minute')

      const newStart = targetWeekStart.add(dayOffset, 'day')
      const newStartFull = dayjs(`${newStart.format('YYYY-MM-DD')}T${timeOfDay}`)
      const newEnd = newStartFull.add(duration, 'minute')

      const duplicateParams: CreateSlotParamsWithTemplateData = {
        startDate: newStartFull.toISOString(),
        endDate: newEnd.toISOString(),
        slotTemplate: {
          startTime: newStartFull.toISOString(),
          endTime: newEnd.toISOString(),
          offsetDays: 0,
          thematic: slot.slotTemplate.thematic,
          location: slot.slotTemplate.location,
          description: slot.slotTemplate.description,
          color: slot.slotTemplate.color,
          isIndividual: slot.slotTemplate.isIndividual,
          capacity: slot.slotTemplate.capacity ?? 1,
          soignantID: slot.slotTemplate.soignant?.id ?? '',
        },
      }
      createSlot.mutate(duplicateParams)
    }

    toast({
      title: 'Duplication en cours',
      message: `${selectedSlotIds.size} créneau(x) dupliqué(s) sur la semaine du ${targetWeekStart.format('DD/MM/YYYY')}`,
      severity: TOAST_SEVERITY.SUCCESS,
    })

    handleClearSelection()
    setShowDuplicateModal(false)
    setDuplicateWeekDate(null)
  }

  const handleBulkDuplicateEditMode = (targetWeekNum: number) => {
    if (!currentPathwayTemplate) return

    for (const eventId of selectedSlotIds) {
      if (!eventId.startsWith('template_')) continue
      const templateId = eventId.replace('template_', '')
      const slotTemplate = currentPathwayTemplate.slotTemplates?.find(
        (t) => t.id === templateId,
      )
      if (!slotTemplate) continue

      const currentOffsetDays = slotTemplate.offsetDays ?? 0
      const dayInWeek = currentOffsetDays % 7
      const newOffsetDays = (targetWeekNum - 1) * 7 + dayInWeek

      createSlotTemplate.mutate({
        startTime: slotTemplate.startTime,
        endTime: slotTemplate.endTime,
        offsetDays: newOffsetDays,
        thematic: slotTemplate.thematic,
        location: slotTemplate.location,
        description: slotTemplate.description,
        color: slotTemplate.color,
        isIndividual: slotTemplate.isIndividual,
        soignantID: slotTemplate.soignant?.id ?? '',
        templateID: currentPathwayTemplate.id,
      })
    }

    toast({
      title: 'Duplication en cours',
      message: `${selectedSlotIds.size} créneau(x) dupliqué(s) sur la semaine ${targetWeekNum}`,
      severity: TOAST_SEVERITY.SUCCESS,
    })

    handleClearSelection()
    setShowDuplicateModal(false)
    setDuplicateTargetWeek(1)
  }

  const handleBulkMove = (targetDate: dayjs.Dayjs) => {
    const targetWeekStart = targetDate.isoWeekday(1).utc().startOf('day')

    for (const eventId of selectedSlotIds) {
      if (!eventId.startsWith('slot_')) continue
      const slotId = eventId.replace('slot_', '')
      const slot = slots?.find((s) => s.id === slotId)
      if (!slot) continue

      const slotStart = dayjs(slot.startDate)
      const slotWeekStart = slotStart.isoWeekday(1).utc().startOf('day')
      const dayOffset = slotStart.diff(slotWeekStart, 'day')
      const timeOfDay = slotStart.format('HH:mm:ss')
      const duration = dayjs(slot.endDate).diff(slotStart, 'minute')

      const newStart = targetWeekStart.add(dayOffset, 'day')
      const newStartFull = dayjs(`${newStart.format('YYYY-MM-DD')}T${timeOfDay}`)
      const newEnd = newStartFull.add(duration, 'minute')

      updateSlot.mutate({
        id: slotId,
        startDate: newStartFull.toISOString(),
        endDate: newEnd.toISOString(),
        slotTemplate: {
          id: slot.slotTemplate.id,
          startTime: newStartFull.toISOString(),
          endTime: newEnd.toISOString(),
        },
      })
    }

    toast({
      title: 'Déplacement en cours',
      message: `${selectedSlotIds.size} créneau(x) déplacé(s) sur la semaine du ${targetWeekStart.format('DD/MM/YYYY')}`,
      severity: TOAST_SEVERITY.SUCCESS,
    })

    handleClearSelection()
    setShowMoveModal(false)
    setMoveWeekDate(null)
  }

  const handleBulkMoveEditMode = (targetWeekNum: number) => {
    if (!currentPathwayTemplate) return

    for (const eventId of selectedSlotIds) {
      if (!eventId.startsWith('template_')) continue
      const templateId = eventId.replace('template_', '')
      const slotTemplate = currentPathwayTemplate.slotTemplates?.find(
        (t) => t.id === templateId,
      )
      if (!slotTemplate) continue

      const currentOffsetDays = slotTemplate.offsetDays ?? 0
      const dayInWeek = currentOffsetDays % 7
      const newOffsetDays = (targetWeekNum - 1) * 7 + dayInWeek

      updateSlotTemplate.mutate({
        id: templateId,
        offsetDays: newOffsetDays,
        startTime: slotTemplate.startTime,
        endTime: slotTemplate.endTime,
      })
    }

    toast({
      title: 'Déplacement en cours',
      message: `${selectedSlotIds.size} créneau(x) déplacé(s) sur la semaine ${targetWeekNum}`,
      severity: TOAST_SEVERITY.SUCCESS,
    })

    handleClearSelection()
    setShowMoveModal(false)
    setMoveTargetWeek(1)
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
    handleClearSelection()
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

        {selectedSlotIds.size > 0 && (
          <div className="mx-6 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-text-dark">
              {selectedSlotIds.size} créneau{selectedSlotIds.size > 1 ? 'x' : ''} sélectionné{selectedSlotIds.size > 1 ? 's' : ''}
            </span>

            <div className="w-48">
              <Select
                options={[
                  { value: 'duplicate', label: 'Dupliquer sur une semaine' },
                  { value: 'move', label: 'Déplacer sur une semaine' },
                ]}
                placeholder="Action..."
                value={bulkAction}
                onValueChange={(v) => {
                  setBulkAction(v)
                  if (v === 'duplicate') {
                    if (editMode) {
                      setDuplicateTargetWeek(1)
                    } else {
                      const { viewStart } = usePlanningStore.getState()
                      setDuplicateWeekDate(viewStart ? dayjs(viewStart).isoWeekday(1) : dayjs().isoWeekday(1))
                    }
                    setShowDuplicateModal(true)
                  } else if (v === 'move') {
                    if (editMode) {
                      setMoveTargetWeek(1)
                    } else {
                      const { viewStart } = usePlanningStore.getState()
                      setMoveWeekDate(viewStart ? dayjs(viewStart).isoWeekday(1) : dayjs().isoWeekday(1))
                    }
                    setShowMoveModal(true)
                  }
                }}
                clearable={false}
              />
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-text-light hover:text-text-dark"
              onClick={handleClearSelection}
            >
              <X className="h-4 w-4" />
              Désélectionner
            </Button>
          </div>
        )}

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
                onDelete={handleDeleteHoverSlot}
                onToggleLock={handleToggleLock}
                selectedSlotIds={selectedSlotIds}
                onToggleSelect={handleToggleSelect}
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
                  eventDidMount={(info) => {
                    if (info.event.extendedProps.type === 'pathway') {
                      info.el.setAttribute('data-pathway-id', info.event.id)
                      info.el.style.cursor = 'pointer'
                    }
                  }}
                  eventMouseEnter={(info) => {
                    if (
                      info.event.extendedProps.type === 'pathway' &&
                      info.event.start &&
                      info.event.end
                    ) {
                      const rect = info.el.getBoundingClientRect()
                      setHoveredPathway({
                        title: info.event.title,
                        start: dayjs(info.event.start).format('DD/MM/YYYY'),
                        end: dayjs(info.event.end)
                          .subtract(1, 'day')
                          .format('DD/MM/YYYY'),
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      })
                      const segments = document.querySelectorAll<HTMLElement>(
                        `[data-pathway-id="${info.event.id}"]`,
                      )
                      segments.forEach((el) => {
                        el.style.filter =
                          'brightness(1.15) drop-shadow(0 2px 8px rgba(0,0,0,0.25))'
                        el.style.zIndex = '10'
                        el.style.transition = 'filter 0.15s ease'
                      })
                    }
                  }}
                  eventMouseLeave={(info) => {
                    setHoveredPathway(null)
                    const segments = document.querySelectorAll<HTMLElement>(
                      `[data-pathway-id="${info.event.id}"]`,
                    )
                    segments.forEach((el) => {
                      el.style.filter = ''
                      el.style.zIndex = ''
                    })
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

        {hoveredPathway && (
          <div
            className="pointer-events-none fixed z-[200] max-w-xs rounded-md border border-border bg-popover px-3 py-2 text-xs text-text-dark shadow-md"
            style={{
              left: hoveredPathway.x,
              top: hoveredPathway.y,
              transform: 'translate(-50%, -100%) translateY(-8px)',
            }}
          >
            <p className="mb-1 font-semibold">{hoveredPathway.title}</p>
            <p>
              {hoveredPathway.start} – {hoveredPathway.end}
            </p>
          </div>
        )}

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

        <ConfirmDeleteForm
          open={!!deleteConfirmEventId}
          setOpen={(open) => { if (!open) { setDeleteConfirmEventId(null) } }}
          onConfirm={handleConfirmDeleteHoverSlot}
          loading={deleteSlot.isPending || deleteSlotTemplate.isPending}
          title="Supprimer le créneau"
          description="Voulez-vous vraiment supprimer ce créneau ? Cette action est irréversible."
        />

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

        {editMode ? (
          <BulkDuplicateForm
            open={showDuplicateModal}
            setOpen={(open) => {
              setShowDuplicateModal(open)
              if (!open) {
                setBulkAction('')
                setDuplicateTargetWeek(1)
              }
            }}
            editMode
            count={selectedSlotIds.size}
            targetWeekNumber={duplicateTargetWeek}
            onTargetWeekNumberChange={setDuplicateTargetWeek}
            onConfirm={() => handleBulkDuplicateEditMode(duplicateTargetWeek)}
          />
        ) : (
          <BulkDuplicateForm
            open={showDuplicateModal}
            setOpen={(open) => {
              setShowDuplicateModal(open)
              if (!open) {
                setBulkAction('')
                setDuplicateWeekDate(null)
              }
            }}
            count={selectedSlotIds.size}
            weekDate={duplicateWeekDate}
            onWeekChange={setDuplicateWeekDate}
            onConfirm={() => {
              if (duplicateWeekDate) handleBulkDuplicate(duplicateWeekDate)
            }}
          />
        )}

        {editMode ? (
          <BulkMoveForm
            open={showMoveModal}
            setOpen={(open) => {
              setShowMoveModal(open)
              if (!open) {
                setBulkAction('')
                setMoveTargetWeek(1)
              }
            }}
            editMode
            count={selectedSlotIds.size}
            targetWeekNumber={moveTargetWeek}
            onTargetWeekNumberChange={setMoveTargetWeek}
            onConfirm={() => handleBulkMoveEditMode(moveTargetWeek)}
          />
        ) : (
          <BulkMoveForm
            open={showMoveModal}
            setOpen={(open) => {
              setShowMoveModal(open)
              if (!open) {
                setBulkAction('')
                setMoveWeekDate(null)
              }
            }}
            count={selectedSlotIds.size}
            weekDate={moveWeekDate}
            onWeekChange={setMoveWeekDate}
            onConfirm={() => {
              if (moveWeekDate) handleBulkMove(moveWeekDate)
            }}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
