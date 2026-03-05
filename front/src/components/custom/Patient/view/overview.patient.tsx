import dayjs from 'dayjs'
import { AlertTriangle, CalendarClock, Siren, X } from 'lucide-react'
import { useMemo } from 'react'

import { SLOT_LOCATION } from '../../../../constants/slot.constant.ts'
import { getLabel } from '../../../../libs/utils.ts'
import { usePatientMutations } from '../../../../queries/usePatient.ts'
import { useAllSlotsQuery } from '../../../../queries/useSlot.ts'
import type { EnrollmentIssue, Patient } from '../../../../types/patient.ts'
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
      className="flex gap-3 rounded-lg px-3 py-3 border border-border transition-colors"
      style={{ backgroundColor: `${color}18` }}
    >
      <div
        className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex flex-col gap-1 min-w-0">
        <span className="font-medium text-sm truncate">
          {soignant ?? thematic}
          {location && (
            <span className="text-text-light font-normal">
              {' · '}
              {getLabel(SLOT_LOCATION, location)}
            </span>
          )}
        </span>
        <span className="text-text-sidebar text-xs">
          {formattedDate} – {endTime}
        </span>
      </div>
    </div>
  )
}

function EnrollmentIssueRow({
  issue,
  onDismiss,
  loading,
}: {
  issue: EnrollmentIssue
  onDismiss: (issue: EnrollmentIssue) => void
  loading: boolean
}) {
  const startDate = dayjs(issue.startDate).format('DD/MM/YYYY')
  return (
    <div className="flex justify-center items-center gap-2 rounded bg-amber-50 border border-amber-200 px-3 py-2">
      <AlertTriangle className="h-3 w-3 text-amber-500" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-amber-700">
          {issue.reason} à partir du{' '}
          <span className="font-semibold">{startDate}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(issue)}
        disabled={loading}
        className="cursor-pointer flex-shrink-0 rounded p-0.5 text-amber-500 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-40 transition-colors"
        aria-label="Ignorer ce problème"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export default function OverviewPatient({ patient }: OverviewPatientProps) {
  const { slots } = useAllSlotsQuery()
  const { dismissEnrollmentIssue } = usePatientMutations()

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

  const handleDismissIssue = (issue: EnrollmentIssue) => {
    if (!patient) {
      return
    }
    dismissEnrollmentIssue.mutate({ patientID: patient.id, issueID: issue.id })
  }

  return (
    <div className="mt-4">
      <div className="relative h-fit flex-1 flex flex-col gap-4">
        {enrollmentIssues && enrollmentIssues.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <Siren className="h-4 w-4 flex-shrink-0" />
              <h4 className="text-sm font-semibold text-text-dark">
                Problèmes d'inscription ({enrollmentIssues.length})
              </h4>
              <div className="flex-1 border-t border-border" />
            </div>

            <div className="flex flex-col gap-1.5">
              {enrollmentIssues.map((issue) => (
                <EnrollmentIssueRow
                  key={issue.id}
                  issue={issue}
                  onDismiss={handleDismissIssue}
                  loading={dismissEnrollmentIssue.isPending}
                />
              ))}
            </div>
          </>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 flex-shrink-0" />
            <h4 className="text-sm font-semibold text-text-dark">
              Rendez-vous
            </h4>
            <div className="flex-1 border-t border-border" />
            <ColorLegend />
          </div>

          <div className="flex flex-col gap-3">
            <div className="bg-input rounded-lg p-4 flex flex-col gap-4">
              <h5 className="text-xs text-text-light uppercase font-semibold tracking-wide">
                À venir ({patientSlots.upcoming.length})
              </h5>
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {patientSlots.upcoming.length > 0 ? (
                  patientSlots.upcoming.map((slot) => (
                    <AppointmentCard key={slot.id} slot={slot} />
                  ))
                ) : (
                  <p className="text-text-sidebar text-sm py-2">
                    Aucun rendez-vous à venir
                  </p>
                )}
              </div>
            </div>

            <div className="bg-input rounded-lg p-4 flex flex-col gap-4">
              <h5 className="text-xs text-text-light uppercase font-semibold tracking-wide">
                Passés ({patientSlots.past.length})
              </h5>
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {patientSlots.past.length > 0 ? (
                  patientSlots.past.map((slot) => (
                    <AppointmentCard key={slot.id} slot={slot} />
                  ))
                ) : (
                  <p className="text-text-sidebar text-sm py-2">
                    Aucun rendez-vous passé
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
