import { useMemo } from 'react'

import { useAllAppointmentsQuery } from '../../../../queries/useAppointment.ts'
import { usePlanningStore } from '../../../../store/usePlanningStore.ts'
import type { Patient } from '../../../../types/patient.ts'
import type { CalendarEvent } from '../../Calendar/calendar.tsx'
import Calendar from '../../Calendar/calendar.tsx'

interface PlanningPatientProps {
  patient?: Patient
}

export default function PlanningPatient({ patient }: PlanningPatientProps) {
  const { appointments } = useAllAppointmentsQuery()
  const savedDate = usePlanningStore((state) => state.viewStart)

  const events: CalendarEvent[] = useMemo(() => {
    if (!appointments || !patient) {
      return []
    }

    return appointments
      .filter((appointment) =>
        appointment.appointmentPatients.some(
          (ap) => ap.patient.id === patient.id,
        ),
      )
      .map((appointment) => ({
        id: appointment.id,
        title:
          appointment.slot?.slotTemplate?.thematic ||
          appointment.thematic ||
          appointment.type ||
          'Rendez-vous',
        start: appointment.startDate,
        end: appointment.endDate,
        backgroundColor: appointment.slot?.slotTemplate?.color,
        borderColor: appointment.slot?.slotTemplate?.color,
      }))
  }, [appointments, patient])

  return (
    <div className="flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
      <h4 className="relative mt-2 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
        <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
          Rendez-vous
        </span>
      </h4>

      <div className="mt-8 flex-1 min-h-0 overflow-hidden">
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
    </div>
  )
}
