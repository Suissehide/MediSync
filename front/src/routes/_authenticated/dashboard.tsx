import type { DateSelectArg } from '@fullcalendar/core'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { CalendarRange } from 'lucide-react'
import { useEffect, useState } from 'react'

import Calendar, {
  type CalendarEvent,
} from '../../components/custom/Calendar/calendar.tsx'
import AddAppointmentForm from '../../components/custom/popup/addAppointmentForm.tsx'
import AppointmentSheet from '../../components/custom/sheet/appointmentSheet.tsx'
import DashboardLayout from '../../components/dashboard.layout.tsx'
import { SLOT } from '../../constants/process.constant.ts'
import {
  buildCalendarEventsFromSlots,
  containsKeyword,
} from '../../libs/utils.ts'
import { useAppointmentMutations } from '../../queries/useAppointment.ts'
import { useAllSlotsQuery } from '../../queries/useSlot.ts'
import { useSoignantStore } from '../../store/useSoignantStore.ts'
import type { CreateAppointmentParams } from '../../types/appointment.ts'

export const Route = createFileRoute('/_authenticated/dashboard')({
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

      setEvents(
        [...slotEvents].sort(
          (a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf(),
        ),
      )
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
    setSelectedEvent(eventID.replace(/^.*?_/, ''))
    const event = getEventById(eventID)
    if (!event || eventID.startsWith('appointment_')) {
      return
    }
    if (
      containsKeyword(event.extendedProps?.states ?? [], ['multiple']) &&
      event.extendedProps?.appointments?.length
    ) {
      return
    }

    setType('multiple')
    setMaxDate(event?.end ?? '')
    selectedDate.startStr = event?.start ?? ''
    selectedDate.endStr = event?.end ?? ''
    setOpenCreateAppointmentModal(true)
  }

  const handleCreateAppointment = (newAppointment: CreateAppointmentParams) => {
    createAppointment.mutate(newAppointment, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
      },
    })
    setOpenCreateAppointmentModal(false)
  }

  const getEventById = (id: string) => {
    return events.find((event) => event.id === id)
  }

  const isAppointment = openEventId.startsWith('appointment_')
  const appointmentId = openEventId.replace(/^.*?_/, '')

  return (
    <DashboardLayout components={['patient', 'soignant']}>
      <div className="pt-2 flex flex-col h-full">
        <h1 className="flex gap-2 items-center px-4 text-text text-xl font-semibold">
          <CalendarRange />
          {soignant ? soignant.name : ''}
        </h1>

        <div className="flex-1 min-h-0 overflow-hidden">
          <Calendar
            events={events}
            editable={false}
            overlap={false}
            handleSelectEvent={handleSelectAppointment}
            handleClickEvent={handleAddAppointment}
            handleOpenEvent={setOpenEventId}
            selectAllow={(selectInfo) => {
              const { start, end } = selectInfo
              const selectionStart = dayjs(start)
              const selectionEnd = dayjs(end)

              // Only allow selection within individual slots
              const individualSlots = events.filter(
                (e) =>
                  e.extendedProps?.type === 'slot' &&
                  containsKeyword(e.extendedProps?.states ?? [], [
                    'individual',
                  ]),
              )

              return individualSlots.some((slot) => {
                const slotStart = dayjs(slot.start)
                const slotEnd = dayjs(slot.end)

                // Check if selection is within slot bounds
                const isWithinSlot =
                  selectionStart.isSameOrAfter(slotStart) &&
                  selectionEnd.isSameOrBefore(slotEnd)

                if (!isWithinSlot) {
                  return false
                }

                // Check if selection overlaps with existing appointments
                const appointments = slot.extendedProps?.appointments ?? []
                const overlapsAppointment = appointments.some(
                  (apt: { startDate: string; endDate: string }) => {
                    const aptStart = dayjs(apt.startDate)
                    const aptEnd = dayjs(apt.endDate)
                    return (
                      selectionStart.isBefore(aptEnd) &&
                      selectionEnd.isAfter(aptStart)
                    )
                  },
                )

                return !overlapsAppointment
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
          soignant={soignant}
          slotID={selectedEvent}
          type={type}
          handleCreateAppointment={handleCreateAppointment}
        />
      )}

      {isAppointment && (
        <AppointmentSheet
          open={isAppointment}
          setOpen={setOpenEventId}
          eventID={appointmentId}
          soignant={soignant}
        />
      )}
    </DashboardLayout>
  )
}

export default Dashboard
