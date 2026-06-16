import type { DateSelectArg } from '@fullcalendar/core'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useMemo, useRef, useState } from 'react'

import { SLOT } from '../../../../constants/process.constant.ts'
import { buildCalendarEventsFromSlots } from '../../../../libs/utils.ts'
import { useAppointmentMutations } from '../../../../queries/useAppointment.ts'
import { usePathwayTemplateQueries } from '../../../../queries/usePathwayTemplate.ts'
import { useAllSlotsQuery } from '../../../../queries/useSlot.ts'
import { usePlanningStore } from '../../../../store/usePlanningStore.ts'
import type { CreateAppointmentParams } from '../../../../types/appointment.ts'
import type { Patient } from '../../../../types/patient.ts'
import type { Soignant } from '../../../../types/soignant.ts'
import { Select } from '../../../ui/select.tsx'
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

  const { pathwayTemplates } = usePathwayTemplateQueries()
  const allTags = useMemo(
    () => [...new Set((pathwayTemplates ?? []).flatMap((t) => t.tags ?? []))],
    [pathwayTemplates],
  )

  const [selectedTag, setSelectedTag] = useState('')
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
      .map((slot) => {
        const apt = slot.appointments?.find((a) =>
          a.appointmentPatients?.some((ap) => ap.patient.id === patient.id),
        )
        return {
          id: `apt_${apt?.id}`,
          title: apt?.thematic || slot.slotTemplate?.thematic || 'Rendez-vous',
          start: apt?.startDate ?? slot.startDate,
          end: apt?.endDate ?? slot.endDate,
          backgroundColor: slot.slotTemplate?.color,
          borderColor: slot.slotTemplate?.color,
        }
      })
  }, [slots, patient])

  const nextAppointmentDate = useMemo(() => {
    if (!slots || !patient) {
      return undefined
    }
    const now = dayjs.utc()
    const nextApt = slots
      .flatMap((s) => s.appointments ?? [])
      .filter(
        (apt) =>
          apt.appointmentPatients?.some(
            (ap) => ap.patient.id === patient.id,
          ) && dayjs.utc(apt.startDate).isAfter(now),
      )
      .sort((a, b) =>
        dayjs.utc(a.startDate).diff(dayjs.utc(b.startDate)),
      )[0]
    return nextApt?.startDate
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

      const filteredSlots =
        selectedTag === '__all__'
          ? slots
          : slots.filter((slot) =>
              slot.pathway?.template?.tags?.includes(selectedTag),
            )

      const baseEvents = buildCalendarEventsFromSlots(filteredSlots, [
        'fillable',
      ])
      const events = baseEvents.map((event) => {
        const slotId = event.id.replace('slot_', '')
        if (enrolledSet.has(slotId)) {
          const color = event.color ?? '#2563eb'
          return {
            ...event,
            backgroundColor: color,
            borderColor: color,
          }
        }
        return event
      })

      return {
        availableEvents: events,
        enrolledSlotIds: enrolledSet,
        patientAppointmentBySlotId: appointmentMap,
      }
    }, [slots, patient, selectedTag])

  const calendarEvents = useMemo(() => {
    if (!selectedTag) {
      return appointmentEvents
    }
    const availableSlotIds = new Set(
      availableEvents.map((e) => e.id.replace('slot_', '')),
    )
    const appointmentsOutsideTag = appointmentEvents.filter((apt) => {
      const aptId = apt.id.replace('apt_', '')
      const slot = slots?.find((s) =>
        s.appointments?.some((a) => a.id === aptId),
      )
      return !slot || !availableSlotIds.has(slot.id)
    })
    return [...availableEvents, ...appointmentsOutsideTag]
  }, [selectedTag, availableEvents, appointmentEvents, slots])

  const handleClickCalendarEvent = (eventId: string) => {
    if (eventId.startsWith('apt_')) {
      handleClickAppointmentEvent(eventId)
    } else {
      handleClickSlot(eventId)
    }
  }

  const handleSelectPatientSlot = (dateSelectArg: DateSelectArg) => {
    setSelectedSlotStart(dateSelectArg.startStr)
    setSelectedSlotEnd(dateSelectArg.endStr)
    setSelectedSlotType('individual')
  }

  const handleClickAppointmentEvent = (eventId: string) => {
    const appointmentId = eventId.replace('apt_', '')
    const slot = slots?.find((s) =>
      s.appointments?.some((a) => a.id === appointmentId),
    )
    if (slot) {
      setSelectedSlotSoignant(slot.slotTemplate?.soignant ?? undefined)
      setOpenAppointmentId(appointmentId)
    }
  }

  const handleOpenEvent = (eventId: string) => {
    const appointmentId = eventId.replace('appointment_', '')
    const slot = slots?.find((s) =>
      s.appointments?.some((a) => a.id === appointmentId),
    )
    if (slot) {
      setSelectedSlotSoignant(slot.slotTemplate?.soignant ?? undefined)
      setOpenAppointmentId(appointmentId)
    }
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
      if (slot.locked) {
        return
      }
      const isIndividual = slot.slotTemplate.isIndividual
      if (!isIndividual && slot.appointments && slot.appointments.length > 0) {
        setSelectedSlotSoignant(slot.slotTemplate.soignant ?? undefined)
        setOpenAppointmentId(slot.appointments[0].id)
        return
      }
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
      <div className="flex justify-end items-center gap-2">
        <div className="w-64">
          <Select
            searchable
            value={selectedTag}
            onValueChange={setSelectedTag}
            placeholder="Afficher les créneaux par tag"
            options={[
              { value: '__all__', label: 'Tout afficher', group: 'all' },
              ...allTags
                .sort((a, b) => a.localeCompare(b))
                .map((tag) => ({ value: tag, label: tag, group: 'tags' })),
            ]}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden [&_.fc_.fc-header-toolbar]:!p-0">
        {slots && (
          <Calendar
            key={selectedTag}
            events={calendarEvents}
            editable={false}
            initialDate={nextAppointmentDate ?? savedDate}
            handleClickEvent={handleClickCalendarEvent}
            handleOpenEvent={handleOpenEvent}
            handleSelectEvent={
              selectedTag ? handleSelectPatientSlot : undefined
            }
            selectAllow={
              selectedTag
                ? (selectInfo) => {
                    const selStart = dayjs.utc(selectInfo.start)
                    const selEnd = dayjs.utc(selectInfo.end)
                    return (slots ?? []).some(
                      (slot) =>
                        slot.slotTemplate.isIndividual &&
                        !slot.locked &&
                        !enrolledSlotIds.has(slot.id) &&
                        selStart.isSameOrAfter(dayjs.utc(slot.startDate)) &&
                        selEnd.isSameOrBefore(dayjs.utc(slot.endDate)),
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
        )}
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
