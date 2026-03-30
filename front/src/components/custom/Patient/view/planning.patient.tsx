import type { DateSelectArg } from '@fullcalendar/core'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useMemo, useRef, useState } from 'react'

import { SLOT } from '../../../../constants/process.constant.ts'
import { hexToRGBA } from '../../../../libs/color.ts'
import { buildCalendarEventsFromSlots } from '../../../../libs/utils.ts'
import { useAppointmentMutations } from '../../../../queries/useAppointment.ts'
import { useAllSlotsQuery } from '../../../../queries/useSlot.ts'
import { usePlanningStore } from '../../../../store/usePlanningStore.ts'
import type { CreateAppointmentParams } from '../../../../types/appointment.ts'
import type { Patient } from '../../../../types/patient.ts'
import type { Soignant } from '../../../../types/soignant.ts'
import { Switch } from '../../../ui/switch.tsx'
import type { CalendarEvent } from '../../Calendar/calendar.tsx'
import Calendar from '../../Calendar/calendar.tsx'
import AddAppointmentForm from '../../popup/addAppointmentForm.tsx'
import AppointmentSheet from '../../sheet/appointmentSheet.tsx'

interface PlanningPatientProps {
  patient?: Patient
}

export default function PlanningPatient({ patient }: PlanningPatientProps) {
  const { slots } = useAllSlotsQuery()
  const savedDate = usePlanningStore((state) => state.viewStart)

  const [showAvailableSlots, setShowAvailableSlots] = useState(false)
  const [openCreateAppointmentModal, setOpenCreateAppointmentModal] =
    useState(false)
  const [openAppointmentId, setOpenAppointmentId] = useState('')
  const [selectedSlotID, setSelectedSlotID] = useState('')
  const [selectedSlotStart, setSelectedSlotStart] = useState('')
  const [selectedSlotEnd, setSelectedSlotEnd] = useState('')
  const [selectedSlotSoignant, setSelectedSlotSoignant] = useState<
    Soignant | undefined
  >()
  const [selectedSlotType, setSelectedSlotType] = useState('')
  const [selectedSlotMaxDate, setSelectedSlotMaxDate] = useState('')
  const calendarUnselectRef = useRef<(() => void) | null>(null)

  const queryClient = useQueryClient()
  const { createAppointment } = useAppointmentMutations()

  const appointmentEvents: CalendarEvent[] = useMemo(() => {
    if (!slots || !patient) {
      return []
    }

    return slots
      .filter((slot) =>
        slot.appointments?.some((appointment) =>
          appointment.appointmentPatients?.some(
            (ap) => ap.patient.id === patient.id,
          ),
        ),
      )
      .map((slot) => ({
        id: slot.id,
        title: slot.slotTemplate?.thematic || 'Rendez-vous',
        start: slot.startDate,
        end: slot.endDate,
        backgroundColor: slot.slotTemplate?.color,
        borderColor: slot.slotTemplate?.color,
      }))
  }, [slots, patient])

  const { availableEvents, enrolledSlotIds, patientAppointmentBySlotId } =
    useMemo(() => {
      if (!slots || !patient) {
        return {
          availableEvents: [] as CalendarEvent[],
          enrolledSlotIds: new Set<string>(),
          patientAppointmentBySlotId: new Map<string, string>(),
        }
      }

      const enrolledSet = new Set<string>()
      const appointmentMap = new Map<string, string>()

      slots.forEach((slot) => {
        const apt = slot.appointments?.find((a) =>
          a.appointmentPatients?.some((ap) => ap.patient.id === patient.id),
        )
        if (apt) {
          enrolledSet.add(slot.id)
          appointmentMap.set(slot.id, apt.id)
        }
      })

      const baseEvents = buildCalendarEventsFromSlots(slots, ['fillable'])
      const events = baseEvents.map((event) => {
        const slotId = event.id.replace('slot_', '')
        if (enrolledSet.has(slotId)) {
          return {
            ...event,
            backgroundColor: hexToRGBA(event.color ?? '#2563eb', 0.3),
            borderColor: hexToRGBA(event.color ?? '#2563eb', 0.3),
          }
        }
        return event
      })

      return {
        availableEvents: events,
        enrolledSlotIds: enrolledSet,
        patientAppointmentBySlotId: appointmentMap,
      }
    }, [slots, patient])

  const handleSelectPatientSlot = (dateSelectArg: DateSelectArg) => {
    setSelectedSlotStart(dateSelectArg.startStr)
    setSelectedSlotEnd(dateSelectArg.endStr)
    setSelectedSlotType('individual')
  }

  const handleClickSlot = (eventId: string) => {
    const slotId = eventId.replace('slot_', '')
    const slot = slots?.find((s) => s.id === slotId)
    if (!slot) {
      return
    }

    if (enrolledSlotIds.has(slotId)) {
      const appointmentId = patientAppointmentBySlotId.get(slotId)
      if (appointmentId) {
        setSelectedSlotSoignant(slot.slotTemplate.soignant ?? undefined)
        setOpenAppointmentId(appointmentId)
      }
    } else {
      const isIndividual = slot.slotTemplate.isIndividual
      setSelectedSlotID(slotId)
      setSelectedSlotSoignant(slot.slotTemplate.soignant ?? undefined)
      setSelectedSlotMaxDate(slot.endDate)
      setSelectedSlotType(isIndividual ? 'individual' : 'multiple')
      if (!isIndividual) {
        setSelectedSlotStart(slot.startDate)
        setSelectedSlotEnd(slot.endDate)
      }
      setOpenCreateAppointmentModal(true)
    }
  }

  const handleCreateAppointment = (newAppointment: CreateAppointmentParams) => {
    createAppointment.mutate(newAppointment, {
      onSuccess: async () => {
        setOpenCreateAppointmentModal(false)
        await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
      },
    })
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3 mt-4">
      <div className="flex justify-end items-center gap-2 px-1">
        <Switch
          checked={showAvailableSlots}
          onCheckedChange={setShowAvailableSlots}
          id="available-slots-switch"
        />
        <label
          htmlFor="available-slots-switch"
          className="text-sm text-text-light cursor-pointer select-none"
        >
          Afficher les créneaux disponibles
        </label>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <Calendar
          events={showAvailableSlots ? availableEvents : appointmentEvents}
          editable={false}
          initialDate={savedDate}
          handleClickEvent={showAvailableSlots ? handleClickSlot : undefined}
          handleSelectEvent={
            showAvailableSlots ? handleSelectPatientSlot : undefined
          }
          selectAllow={
            showAvailableSlots
              ? (selectInfo) => {
                  const selStart = dayjs(selectInfo.start)
                  const selEnd = dayjs(selectInfo.end)
                  return (slots ?? []).some(
                    (slot) =>
                      slot.slotTemplate.isIndividual &&
                      !enrolledSlotIds.has(slot.id) &&
                      selStart.isSameOrAfter(dayjs(slot.startDate)) &&
                      selEnd.isSameOrBefore(dayjs(slot.endDate)),
                  )
                }
              : undefined
          }
          unselectRef={calendarUnselectRef}
          headerToolbar={{
            left: 'title',
            right: 'prev,next today',
          }}
        />
      </div>

      {openCreateAppointmentModal && (
        <AddAppointmentForm
          open={openCreateAppointmentModal}
          setOpen={(open) => {
            if (!open) {
              calendarUnselectRef.current?.()
            }
            setOpenCreateAppointmentModal(open)
          }}
          startDate={selectedSlotStart}
          endDate={selectedSlotEnd}
          maxDate={selectedSlotMaxDate}
          slotID={selectedSlotID}
          soignant={selectedSlotSoignant}
          type={selectedSlotType}
          handleCreateAppointment={handleCreateAppointment}
          defaultPatientIDs={patient ? [patient.id] : []}
        />
      )}

      <AppointmentSheet
        open={!!openAppointmentId}
        setOpen={setOpenAppointmentId}
        eventID={openAppointmentId}
        soignant={selectedSlotSoignant}
      />
    </div>
  )
}
