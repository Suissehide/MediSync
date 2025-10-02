import { createFileRoute, redirect } from '@tanstack/react-router'
import DashboardLayout from '../../components/dashboard.layout.tsx'
import Calendar, {
  type CalendarEvent,
} from '../../components/custom/Calendar/calendar.tsx'
import { useEffect, useMemo, useState } from 'react'
import { useAllSlotsQuery, useSlotMutations } from '../../queries/useSlot.ts'
import {} from '../../types/slot.ts'
import type { DateSelectArg, EventDropArg } from '@fullcalendar/core'
import {
  buildCalendarEventsFromSlots,
  buildCalendarEventsFromSlotTemplates,
} from '../../libs/utils.ts'
import AddSlotForm from '../../components/custom/Popup/addSlotForm.tsx'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { usePathwayTemplateEditStore } from '../../store/usePathwayTemplateEditStore.ts'
import { useSlotTemplateMutations } from '../../queries/useSlotTemplate.ts'
import type { CreateSlotParamsWithTemplateData } from '../../types/slot.ts'
import dayjs from 'dayjs'
import { usePathwayMutations } from '../../queries/usePathway.ts'

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
  const { createSlot, updateSlot, deleteSlot } = useSlotMutations()
  const { instantiatePathway } = usePathwayMutations()
  const { createSlotTemplate, updateSlotTemplate, deleteSlotTemplate } =
    useSlotTemplateMutations()
  const editMode = usePathwayTemplateEditStore((state) => state.editMode)
  const startDate = usePathwayTemplateEditStore((state) => state.startDate)
  const currentPathwayTemplate = usePathwayTemplateEditStore(
    (state) => state.currentPathwayTemplate,
  )

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
      createSlotTemplate.mutate(slotTemplate)
    } else {
      createSlot.mutate(newSlot)
    }
    setOpenCreateSlotModal(false)
  }

  const handleEditSlot = (eventDropArg: EventDropArg | EventResizeDoneArg) => {
    const {
      id,
      startStr: start,
      endStr: end,
      extendedProps,
    } = eventDropArg.event

    if (editMode) {
      setEventTemplates((prev) =>
        prev.map((evt) => (evt.id === id ? { ...evt, start, end } : evt)),
      )
      updateSlotTemplate.mutate({
        id,
        startTime: start,
        endTime: end,
      })
    } else {
      setEvents((prev) =>
        prev.map((evt) => (evt.id === id ? { ...evt, start, end } : evt)),
      )
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
      setEventTemplates((prev) =>
        prev.filter((eventTemplate) => eventTemplate.id !== id),
      )
      deleteSlotTemplate.mutate(id)
    } else {
      setEvents((prev) => prev.filter((event) => event.id !== id))
      deleteSlot.mutate(id)
    }
  }

  const mergedEvents = useMemo(() => {
    return editMode ? [...events, ...(eventTemplates ?? [])] : events
  }, [events, eventTemplates, editMode])

  return (
    <DashboardLayout component={'pathway'}>
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 overflow-hidden">
          <Calendar
            events={mergedEvents}
            handleSelectEvent={handleSelectSlot}
            handleEditEvent={handleEditSlot}
            handleDeleteEvent={handleDeleteEvent}
            handleDropEvent={handleInstantiatePathway}
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
    </DashboardLayout>
  )
}
