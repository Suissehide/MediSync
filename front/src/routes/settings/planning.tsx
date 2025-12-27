import type { DateSelectArg, EventDropArg } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { createFileRoute, redirect } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'

import Calendar, {
  type CalendarEvent,
} from '../../components/custom/Calendar/calendar.tsx'
import AddSlotForm from '../../components/custom/popup/addSlotForm.tsx'
import EventSheet from '../../components/custom/sheet/eventSheet.tsx'
import EventTemplateSheet from '../../components/custom/sheet/eventTemplateSheet.tsx'
import DashboardLayout from '../../components/dashboard.layout.tsx'
import {
  buildCalendarEventsFromSlots,
  buildCalendarEventsFromSlotTemplates,
} from '../../libs/utils.ts'
import { usePathwayMutations } from '../../queries/usePathway.ts'
import { usePathwayTemplateQueries } from '../../queries/usePathwayTemplate.ts'
import { useAllSlotsQuery, useSlotMutations } from '../../queries/useSlot.ts'
import { useSlotTemplateMutations } from '../../queries/useSlotTemplate.ts'
import { usePathwayTemplateEditStore } from '../../store/usePathwayTemplateEditStore.ts'
import type { CreateSlotParamsWithTemplateData } from '../../types/slot.ts'

export const Route = createFileRoute('/settings/planning')({
  beforeLoad: ({ context, location }) => {
    if (!context.authState.isAuthenticated) {
      throw redirect({
        to: '/auth/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  shouldReload({ context }) {
    return !context.authState.isAuthenticated
  },
  component: Planning,
})

function Planning() {
  const { slots } = useAllSlotsQuery()
  const { pathwayTemplates } = usePathwayTemplateQueries()
  const { createSlot, updateSlot, deleteSlot } = useSlotMutations()
  const { instantiatePathway } = usePathwayMutations()
  const { createSlotTemplate, updateSlotTemplate, deleteSlotTemplate } =
    useSlotTemplateMutations()
  const editMode = usePathwayTemplateEditStore((state) => state.editMode)
  const startDate = usePathwayTemplateEditStore((state) => state.startDate)
  const currentPathwayTemplateId = usePathwayTemplateEditStore(
    (state) => state.currentPathwayTemplate?.id,
  )
  const currentPathwayTemplate = pathwayTemplates?.find(
    (template) => template.id === currentPathwayTemplateId,
  )

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

    if (editMode) {
      const newOffsetDays = dayjs(start).diff(dayjs(startDate), 'day')

      updateSlotTemplate.mutate({
        id,
        offsetDays: newOffsetDays,
        startTime: start,
        endTime: end,
      })
    } else {
      updateSlot.mutate({
        id,
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

  const mergedEvents = useMemo(() => {
    return editMode ? [...events, ...(eventTemplates ?? [])] : events
  }, [events, eventTemplates, editMode])

  const isSlot = openEventId.startsWith('slot_')
  const slotId = isSlot ? openEventId.replace('slot_', '') : ''

  return (
    <DashboardLayout components={['pathway']}>
      <h2 className="flex gap-2 items-center px-4 pt-2 text-text text-lg font-semibold">
        Planning
      </h2>

      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 overflow-hidden">
          <Calendar
            events={mergedEvents}
            handleSelectEvent={handleSelectSlot}
            handleEditEvent={handleEditSlot}
            handleDropEvent={handleInstantiatePathway}
            handleOpenEvent={setOpenEventId}
            editMode={editMode}
            editable={true}
          />
        </div>
      </div>

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
        open={isSlot && editMode}
        setOpen={setOpenEventId}
        eventTemplateID={slotId}
        handleDeleteEvent={handleDeleteEvent}
      />
    </DashboardLayout>
  )
}
