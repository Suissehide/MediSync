import type { DateSelectArg } from '@fullcalendar/core'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { CalendarRange } from 'lucide-react'
import { useEffect, useState } from 'react'

import Calendar, {
  type CalendarEvent,
} from '../components/custom/Calendar/calendar.tsx'
import AppointmentSheet from '../components/custom/Calendar/sheet/appointmentSheet.tsx'
import AddAppointmentForm from '../components/custom/Popup/addAppointmentForm.tsx'
import DashboardLayout from '../components/dashboard.layout.tsx'
import DropdownFilter from '../components/ui/dropdownFilter.tsx'
import { SLOT } from '../constants/process.constant.ts'
import {
  buildCalendarEventsFromAppointments,
  buildCalendarEventsFromSlots,
  containsKeyword,
} from '../libs/utils.ts'
import { useAppointmentMutations } from '../queries/useAppointment.ts'
import { useAllSlotsQuery } from '../queries/useSlot.ts'
import { useSoignantStore } from '../store/useSoignantStore.ts'
import type { CreateAppointmentParams } from '../types/appointment.ts'

export const Route = createFileRoute('/dashboard')({
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
  component: Dashboard,
})

function Dashboard() {
  const queryClient = useQueryClient()
  const [openEventId, setOpenEventId] = useState('')
  const selectedID = useSoignantStore((state) => state.selectedSoignantID)
  const soignant = useSoignantStore((state) =>
    state.soignants.find((s) => s.id === selectedID),
  )

  const { slots } = useAllSlotsQuery()
  const { createAppointment, deleteAppointment } = useAppointmentMutations()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDate, setSelectedDate] = useState({ startStr: '', endStr: '' })
  const [openCreateAppointmentModal, setOpenCreateAppointmentModal] =
    useState(false)
  const [selectedEvent, setSelectedEvent] = useState('')
  const [maxDate, setMaxDate] = useState('')
  const [type, setType] = useState('')
  const [filters, setFilters] = useState([
    { id: 'appointments', label: 'Afficher les rendez-vous', checked: true },
    { id: 'slots', label: 'Afficher les créneaux', checked: true },
  ])

  const handleFilterChange = (id: string, checked: boolean) => {
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, checked } : f)))
  }

  useEffect(() => {
    if (slots) {
      const filtered = selectedID
        ? slots.filter((slot) => slot.slotTemplate?.soignant?.id === selectedID)
        : slots

      const eventsToDisplay = []

      if (filters.find((f) => f.id === 'slots')?.checked) {
        const slotEvents = buildCalendarEventsFromSlots(filtered, ['fillable'])
        eventsToDisplay.push(...slotEvents)
      }

      if (filters.find((f) => f.id === 'appointments')?.checked) {
        const allAppointments = filtered.flatMap(
          (slot) => slot.appointments ?? [],
        )
        const appointmentEvents =
          buildCalendarEventsFromAppointments(allAppointments)
        eventsToDisplay.push(...appointmentEvents)
      }

      setEvents(eventsToDisplay)
    }
  }, [slots, selectedID, filters])

  const handleSelectAppointment = (dateSelectArg: DateSelectArg) => {
    setSelectedDate({
      startStr: dateSelectArg.startStr,
      endStr: dateSelectArg.endStr,
    })
    setType('individual')
  }

  const handleAddAppointment = (eventID: string) => {
    setSelectedEvent(eventID)
    const event = getEventById(eventID)
    if (!event) {
      return
    }

    if (
      event.extendedProps?.type === 'appointment' ||
      (event.extendedProps?.states &&
        containsKeyword(event.extendedProps.states, ['multiple']) &&
        event.extendedProps.appointments?.length)
    ) {
      console.log('appointment')
    } else {
      setType('multiple')
      setMaxDate(event?.end ?? '')
      selectedDate.startStr = event?.start ?? ''
      selectedDate.endStr = event?.end ?? ''
      setOpenCreateAppointmentModal(true)
    }
  }

  const handleCreateAppointment = (newAppointment: CreateAppointmentParams) => {
    createAppointment.mutate(newAppointment, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
      },
    })
    setOpenCreateAppointmentModal(false)
  }

  const handleDeleteEvent = (id: string) => {
    setEvents((prev) => prev.filter((event) => event.id !== id))
    deleteAppointment.mutate(id)
  }

  const getEventById = (id: string) => {
    return events.find((event) => event.id === id)
  }

  return (
    <DashboardLayout components={['patient', 'soignant']}>
      <div className="pt-2 flex flex-col h-full">
        <h2 className="flex gap-2 items-center px-4 text-text text-lg font-semibold">
          <CalendarRange />
          {soignant ? soignant.name : ''}
        </h2>

        <div className="px-4 pb-2 flex justify-end">
          <DropdownFilter
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <Calendar
            events={events}
            editable={false}
            handleSelectEvent={handleSelectAppointment}
            handleClickEvent={handleAddAppointment}
            handleOpenEvent={setOpenEventId}
            selectAllow={(selectInfo) => {
              const { start, end } = selectInfo

              return events
                .filter((e) => e.extendedProps?.type === 'slot')
                .some((slot) => {
                  const slotStart = dayjs(slot.start)
                  const slotEnd = dayjs(slot.end)
                  const selectionStart = dayjs(start)
                  const selectionEnd = dayjs(end)

                  return (
                    selectionStart.isSameOrAfter(slotStart) &&
                    selectionEnd.isSameOrBefore(slotEnd)
                  )
                })
            }}
          />
        </div>
      </div>

      {openCreateAppointmentModal && (
        <AddAppointmentForm
          open={openCreateAppointmentModal}
          setOpen={setOpenCreateAppointmentModal}
          startDate={selectedDate.startStr}
          endDate={selectedDate.endStr}
          maxDate={maxDate}
          slotID={selectedEvent}
          type={type}
          handleCreateAppointment={handleCreateAppointment}
        />
      )}

      <AppointmentSheet
        open={!!openEventId}
        setOpen={setOpenEventId}
        eventID={openEventId}
        handleDeleteEvent={handleDeleteEvent}
      />
    </DashboardLayout>
  )
}

export default Dashboard
