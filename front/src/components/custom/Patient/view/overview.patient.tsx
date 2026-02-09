import dayjs from 'dayjs'
import { AlertTriangle } from 'lucide-react'
import { useMemo } from 'react'

import { SLOT_LOCATION } from '../../../../constants/slot.constant.ts'
import { getLabel } from '../../../../libs/utils.ts'
import { useAllSlotsQuery } from '../../../../queries/useSlot.ts'
import type { Patient } from '../../../../types/patient.ts'
import type { Slot } from '../../../../types/slot.ts'
import { ColorLegend } from '../../colorLegend.tsx'

interface OverviewPatientProps {
  patient?: Patient
}

function AppointmentCard({ slot }: { slot: Slot }) {
  const color = slot.slotTemplate?.color ?? '#6b7280'
  const thematic = slot.slotTemplate?.thematic || 'Rendez-vous'
  const location = slot.slotTemplate?.location
  const soignant = slot.slotTemplate?.soignant?.name

  const formattedDate = dayjs(slot.startDate)
    .format('dddd D MMMM YYYY [de] HH:mm')
    .replace(/^./, (c) => c.toUpperCase())
  const endTime = dayjs(slot.endDate).format('HH:mm')

  return (
    <div
      className="flex gap-2 rounded-lg px-3 py-2"
      style={{ backgroundColor: `${color}20` }}
    >
      <div className="border-2 rounded-lg" style={{ borderColor: color }} />
      <div className="flex flex-col">
        <div>
          {soignant ?? thematic}
          {location && (
            <>
              {' - '}
              <span className="">{getLabel(SLOT_LOCATION, location)}</span>
            </>
          )}
        </div>
        <div className="text-text-light text-sm">
          {formattedDate} - {endTime}
        </div>
      </div>
    </div>
  )
}

export default function OverviewPatient({ patient }: OverviewPatientProps) {
  const { slots } = useAllSlotsQuery()

  const patientSlots = useMemo(() => {
    if (!slots || !patient) {
      return { upcoming: [], past: [] }
    }

    const now = dayjs()
    const filtered = slots.filter((slot) =>
      slot.appointments?.some((appointment) =>
        appointment.appointmentPatients?.some(
          (ap) => ap.patient.id === patient.id,
        ),
      ),
    )

    const upcoming = filtered
      .filter((s) => dayjs(s.startDate).isAfter(now))
      .sort((a, b) => dayjs(a.startDate).diff(dayjs(b.startDate)))

    const past = filtered
      .filter((s) => dayjs(s.startDate).isBefore(now))
      .sort((a, b) => dayjs(b.startDate).diff(dayjs(a.startDate)))

    return { upcoming, past }
  }, [slots, patient])

  const enrollmentIssues = patient?.enrollmentIssues

  return (
    <div className="relative h-fit flex-1 px-4 py-4 flex flex-col gap-2 border border-border rounded-lg">
      {enrollmentIssues && enrollmentIssues.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 font-medium text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Problèmes d'inscription ({enrollmentIssues.length})
          </div>
          <ul className="ml-6 list-disc text-sm text-amber-700">
            {enrollmentIssues.map((issue) => (
              <li key={issue.pathwayTemplateID}>
                <span className="font-medium">{issue.pathwayName ?? issue.pathwayTemplateID}</span>
                {' : '}
                {issue.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ColorLegend
        title="Légende des couleurs"
        className="z-10 absolute right-3 top-3"
      />

      <h4 className="relative mt-2 text-lg font-semibold w-full after:absolute after:bottom-[-3px] after:left-0 after:h-[1px] after:w-full after:bg-border">
        <span className="relative inline-block z-10 before:absolute before:bottom-[-5px] before:left-0 before:h-[5px] before:w-full before:bg-primary before:rounded-full">
          Rendez-vous
        </span>
      </h4>

      <h5 className="mt-4 mb-2 text-sm text-text-light uppercase font-semibold">
        À venir ({patientSlots.upcoming.length})
      </h5>
      <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
        {patientSlots.upcoming.length > 0 ? (
          patientSlots.upcoming.map((slot) => (
            <AppointmentCard key={slot.id} slot={slot} />
          ))
        ) : (
          <p className="text-text-light text-sm">Aucun rendez-vous à venir</p>
        )}
      </div>

      <h5 className="my-2 text-sm text-text-light uppercase font-semibold">
        Passés ({patientSlots.past.length})
      </h5>
      <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
        {patientSlots.past.length > 0 ? (
          patientSlots.past.map((slot) => (
            <AppointmentCard key={slot.id} slot={slot} />
          ))
        ) : (
          <p className="text-text-light text-sm">Aucun rendez-vous passé</p>
        )}
      </div>
    </div>
  )
}
