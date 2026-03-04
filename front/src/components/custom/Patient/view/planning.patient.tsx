import { useMemo } from 'react'

import { useAllSlotsQuery } from '../../../../queries/useSlot.ts'
import { usePlanningStore } from '../../../../store/usePlanningStore.ts'
import type { Patient } from '../../../../types/patient.ts'
import type { CalendarEvent } from '../../Calendar/calendar.tsx'
import Calendar from '../../Calendar/calendar.tsx'

interface PlanningPatientProps {
  patient?: Patient
}

export default function PlanningPatient({ patient }: PlanningPatientProps) {
  const { slots } = useAllSlotsQuery()
  const savedDate = usePlanningStore((state) => state.viewStart)

  const events: CalendarEvent[] = useMemo(() => {
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

  return (
    <div className="flex-1 min-h-0 overflow-hidden mt-4">
      <Calendar
        events={events}
        editable={false}
        initialDate={savedDate}
        headerToolbar={{
          left: 'title',
          right: 'prev,next today',
        }}
      />
    </div>
  )
}
