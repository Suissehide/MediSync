import { createFileRoute, redirect } from '@tanstack/react-router'
import DashboardLayout from '../components/dashboard.layout.tsx'
import { useSoignantStore } from '../store/useSoignantStore.ts'
import { CalendarRange } from 'lucide-react'
import Calendar, {
  type CalendarEvent,
} from '../components/custom/Calendar/calendar.tsx'
import { useAllSlotsQuery } from '../queries/useSlot.ts'
import { useEffect, useState } from 'react'
import {
  buildCalendarEventsFromAppointments,
  buildCalendarEventsFromSlots,
} from '../libs/utils.ts'
import AddAppointmentForm from '../components/custom/Popup/addAppointmentForm.tsx'
import type { CreateAppointmentParams } from '../types/appointment.ts'
import type { DateSelectArg } from '@fullcalendar/core'
import { useAppointmentMutations } from '../queries/useAppointment.ts'
import dayjs from 'dayjs'

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
  const selectedID = useSoignantStore((state) => state.selectedSoignantID)
  const soignant = useSoignantStore((state) =>
    state.soignants.find((s) => s.id === selectedID),
  )

  const { slots } = useAllSlotsQuery()
  const { createAppointment } = useAppointmentMutations()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDate, setSelectedDate] = useState({ startStr: '', endStr: '' })
  const [openCreateAppointmentModal, setOpenCreateAppointmentModal] =
    useState(false)
  const [selectedEvent, setSelectedEvent] = useState('')
  const [maxDate, setMaxDate] = useState('')
  const [type, setType] = useState('')

  useEffect(() => {
    if (slots) {
      const filtered = selectedID
        ? slots.filter((slot) => slot.slotTemplate?.soignant?.id === selectedID)
        : slots

      const slotEvents = buildCalendarEventsFromSlots(filtered, ['fillable'])
      const allAppointments = filtered.flatMap(
        (slot) => slot.appointments ?? [],
      )
      const appointmentEvents =
        buildCalendarEventsFromAppointments(allAppointments)

      setEvents([...slotEvents, ...appointmentEvents])
    }
  }, [slots, selectedID])

  const handleSelectAppointment = (dateSelectArg: DateSelectArg) => {
    setSelectedDate({
      startStr: dateSelectArg.startStr,
      endStr: dateSelectArg.endStr,
    })
    setType('individual')
  }

  const handleAddAppointment = (eventID: string) => {
    setType('multiple')
    setSelectedEvent(eventID)
    const event = getEventById(eventID)
    setMaxDate(event?.end ?? '')
    selectedDate.startStr = event?.start ?? ''
    selectedDate.endStr = event?.end ?? ''
    setOpenCreateAppointmentModal(true)
  }

  const handleCreateAppointment = (newAppointment: CreateAppointmentParams) => {
    createAppointment.mutate(newAppointment)
    setOpenCreateAppointmentModal(false)
  }

  const getEventById = (id: string) => {
    return events.find((event) => event.id === id)
  }

  return (
    <DashboardLayout component={'soignant'}>
      <div className="flex flex-col h-full">
        <h2 className="flex gap-2 items-center px-4 mt-0 mb-1 text-text">
          <CalendarRange />
          {soignant ? soignant.name : ''}
        </h2>

        <div className="flex-1 min-h-0 overflow-hidden">
          <Calendar
            events={events}
            editable={false}
            handleSelectEvent={handleSelectAppointment}
            handleClickEvent={handleAddAppointment}
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
    </DashboardLayout>
  )
}

export default Dashboard
