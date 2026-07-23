import type { DateSelectArg } from '@fullcalendar/core'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { CalendarRange, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import Calendar, {
  type CalendarEvent,
} from '../../components/custom/Calendar/calendar.tsx'
import AddAppointmentForm from '../../components/custom/popup/addAppointmentForm.tsx'
import AddPatientForm from '../../components/custom/popup/addPatientForm.tsx'
import AppointmentSheet from '../../components/custom/sheet/appointmentSheet.tsx'
import DashboardLayout from '../../components/dashboard.layout.tsx'
import { SLOT } from '../../constants/process.constant.ts'
import {
  buildCalendarEventsFromSlots,
  containsKeyword,
} from '../../libs/utils.ts'
import { useAppointmentMutations } from '../../queries/useAppointment.ts'
import { useAllSlotsQuery } from '../../queries/useSlot.ts'
import { usePlanningStore } from '../../store/usePlanningStore.ts'
import { useSoignantStore } from '../../store/useSoignantStore.ts'
import type { CreateAppointmentParams } from '../../types/appointment.ts'
import type { Soignant } from '../../types/soignant.ts'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: Dashboard,
})

function Dashboard() {
  const queryClient = useQueryClient()
  const [openEventId, setOpenEventId] = useState('')
  const selectedIDs = useSoignantStore((state) => state.selectedSoignantIDs)
  const soignants = useSoignantStore((state) => state.soignants)
  const unselectSoignant = useSoignantStore((state) => state.unselectSoignant)
  const savedDate = usePlanningStore((state) => state.viewStart)
  const selectedSoignants = soignants.filter((s) => selectedIDs.includes(s.id))

  const { slots } = useAllSlotsQuery()
  const { createAppointment } = useAppointmentMutations()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDate, setSelectedDate] = useState({ startStr: '', endStr: '' })
  const [openCreateAppointmentModal, setOpenCreateAppointmentModal] =
    useState(false)
  const [selectedEvent, setSelectedEvent] = useState('')
  const [maxDate, setMaxDate] = useState('')
  const [type, setType] = useState('')
  const [slotSoignants, setSlotSoignants] = useState<Soignant[]>([])
  const calendarUnselectRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (slots) {
      const filtered =
        selectedIDs.length > 0
          ? slots.filter((slot) =>
              slot.slotTemplate?.soignants?.some((s) =>
                selectedIDs.includes(s.id),
              ),
            )
          : []

      const slotEvents = buildCalendarEventsFromSlots(filtered, ['fillable'])

      setEvents(
        [...slotEvents].sort(
          (a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf(),
        ),
      )
    }
  }, [slots, selectedIDs])

  const handleSelectAppointment = (dateSelectArg: DateSelectArg) => {
    setSelectedDate({
      startStr: dateSelectArg.startStr,
      endStr: dateSelectArg.endStr,
    })
    setType('individual')
  }

  const handleAddAppointment = (eventID: string) => {
    const slotId = eventID.replace(/^.*?_/, '')
    setSelectedEvent(slotId)
    const event = getEventById(eventID)
    if (!event || eventID.startsWith('appointment_')) {
      return
    }
    if (event.extendedProps?.locked) {
      return
    }
    if (
      containsKeyword(event.extendedProps?.states ?? [], ['multiple']) &&
      event.extendedProps?.appointments?.length
    ) {
      return
    }

    const slot = slots?.find((s) => s.id === slotId)
    setSlotSoignants(slot?.slotTemplate?.soignants ?? [])

    setType('multiple')
    setMaxDate(event?.end ?? '')
    setSelectedDate({
      startStr: event?.start ?? '',
      endStr: event?.end ?? '',
    })
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

  const handleOpenEvent = (eventId: string) => {
    if (eventId.startsWith('appointment_')) {
      const aptId = eventId.replace(/^.*?_/, '')
      const slot = slots?.find((s) =>
        s.appointments?.some((a) => a.id === aptId),
      )
      setSlotSoignants(slot?.slotTemplate?.soignants ?? [])
    }
    setOpenEventId(eventId)
  }

  const isAppointment = openEventId.startsWith('appointment_')
  const appointmentId = openEventId.replace(/^.*?_/, '')

  return (
    <DashboardLayout
      components={['soignant']}
      quickActions={[<AddPatientForm key="add-patient" />]}
    >
      <div className="flex-1 bg-background rounded-lg flex flex-col w-full gap-4">
        <div className="flex flex-col h-full">
          <div className="px-6 mt-6 mb-4 flex gap-2 items-center">
            <div className="flex items-center justify-center bg-foreground p-2 rounded-full">
              <CalendarRange className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-text-dark text-xl font-semibold">
              {selectedSoignants.length > 0
                ? selectedSoignants.map((s) => s.name).join(', ')
                : 'Sélectionnez un soignant'}
            </h1>
            {selectedSoignants.length > 0 && (
              <button
                type="button"
                onClick={() => unselectSoignant()}
                aria-label="Effacer la sélection"
                className="cursor-pointer text-text-dark/60 hover:text-text-dark transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="fc-dashboard flex-1 min-h-0 overflow-hidden">
            <Calendar
              events={events}
              editable={false}
              overlap={false}
              initialDate={savedDate}
              handleSelectEvent={handleSelectAppointment}
              handleClickEvent={handleAddAppointment}
              handleOpenEvent={handleOpenEvent}
              selectAllow={(selectInfo) => {
                const { start, end } = selectInfo
                const selectionStart = dayjs(start)
                const selectionEnd = dayjs(end)

                // Only allow selection within individual slots that are not locked
                const individualSlots = events.filter(
                  (e) =>
                    e.extendedProps?.type === 'slot' &&
                    !e.extendedProps?.locked &&
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
              unselectRef={calendarUnselectRef}
            />
          </div>
        </div>

        {openCreateAppointmentModal && (
          <AddAppointmentForm
            open={openCreateAppointmentModal}
            setOpen={(open) => {
              if (!open) calendarUnselectRef.current?.()
              setOpenCreateAppointmentModal(open)
            }}
            startDate={selectedDate.startStr}
            endDate={selectedDate.endStr}
            maxDate={maxDate}
            soignants={slotSoignants}
            slotID={selectedEvent}
            type={type}
            handleCreateAppointment={handleCreateAppointment}
            isPending={createAppointment.isPending}
          />
        )}

        {isAppointment && (
          <AppointmentSheet
            open={isAppointment}
            setOpen={setOpenEventId}
            eventID={appointmentId}
            soignants={slotSoignants}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

export default Dashboard
