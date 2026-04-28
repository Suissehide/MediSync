import dayjs from 'dayjs'
import { AlertTriangle, CalendarClock, Route, Siren, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { PatientApi } from '../../../../api/patient.api.ts'
import { SLOT_LOCATION } from '../../../../constants/slot.constant.ts'
import { hexToRGBA, getContrastTextColor } from '../../../../libs/color.ts'
import { getLabel } from '../../../../libs/utils.ts'
import { usePatientMutations } from '../../../../queries/usePatient.tsx'
import { useAllSlotsQuery } from '../../../../queries/useSlot.ts'
import type { EnrollmentIssue, Patient } from '../../../../types/patient.ts'
import type { Slot } from '../../../../types/slot.ts'
import { ColorLegend } from '../../colorLegend.tsx'
import { ConfirmDeleteForm } from '../../popup/confirmDeleteForm.tsx'

interface OverviewPatientProps {
  patient?: Patient
}

function AppointmentCard({ slot }: { slot: Slot }) {
  const color = slot.slotTemplate?.color ?? '#6b7280'
  const thematic = slot.slotTemplate?.thematic || 'Rendez-vous'
  const location = slot.slotTemplate?.location
  const soignant = slot.slotTemplate?.soignant?.name

  const formattedDate = dayjs.utc(slot.startDate)
    .format('dddd D MMMM YYYY [de] HH:mm')
    .replace(/^./, (c) => c.toUpperCase())
  const endTime = dayjs.utc(slot.endDate).format('HH:mm')

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

function PathwayCard({
  pathwayID,
  templateName,
  templateColor,
  startDate,
  onRemove,
}: {
  pathwayID: string
  templateName: string
  templateColor: string | null
  startDate: string
  onRemove: (pathwayID: string) => void
}) {
  const color = templateColor ?? '#6b7280'
  const formattedDate = dayjs(startDate)
    .format('D MMMM YYYY')
    .replace(/^./, (c) => c.toUpperCase())

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 border border-border">
      <span
        className="inline-block px-2 py-1 rounded text-xs font-medium border"
        style={{
          backgroundColor: hexToRGBA(color, 0.15),
          color: getContrastTextColor(color),
          borderColor: hexToRGBA(color, 0.6),
        }}
      >
        {templateName}
      </span>
      <span className="text-xs text-text-sidebar flex-1">
        Début : {formattedDate}
      </span>
      <button
        type="button"
        onClick={() => onRemove(pathwayID)}
        className="cursor-pointer flex-shrink-0 rounded p-1 text-text-light hover:bg-destructive/10 hover:text-destructive transition-colors"
        aria-label={`Retirer du parcours ${templateName}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export default function OverviewPatient({ patient }: OverviewPatientProps) {
  const { slots } = useAllSlotsQuery()
  const { dismissEnrollmentIssue, removeFromPathway } = usePatientMutations()

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

  const patientPathways = useMemo(() => {
    if (!slots || !patient) return []

    const pathwayMap = new Map<
      string,
      { id: string; templateName: string; templateColor: string | null; startDate: string }
    >()

    for (const slot of slots) {
      if (!slot.pathway) continue
      const hasPatient = slot.appointments?.some((appointment) =>
        appointment.appointmentPatients?.some(
          (ap) => ap.patient.id === patient.id,
        ),
      )
      if (!hasPatient) continue

      const pathwayID = slot.pathway.id
      if (!pathwayMap.has(pathwayID)) {
        pathwayMap.set(pathwayID, {
          id: pathwayID,
          templateName: slot.pathway.template?.name ?? 'Parcours sans template',
          templateColor: slot.pathway.template?.color ?? null,
          startDate: slot.pathway.startDate,
        })
      }
    }

    return Array.from(pathwayMap.values())
  }, [slots, patient])

  const [removeTarget, setRemoveTarget] = useState<{
    pathwayID: string
    name: string
    count: number
  } | null>(null)

  const handleRemoveClick = useCallback(
    async (pathwayID: string) => {
      if (!patient) return
      const { count } = await PatientApi.getAppointmentsCountInPathway(
        patient.id,
        pathwayID,
      )
      const pathway = patientPathways.find((p) => p.id === pathwayID)
      setRemoveTarget({
        pathwayID,
        name: pathway?.templateName ?? 'Parcours',
        count,
      })
    },
    [patient, patientPathways],
  )

  const handleConfirmRemove = useCallback(() => {
    if (!patient || !removeTarget) return
    removeFromPathway.mutate(
      { patientID: patient.id, pathwayID: removeTarget.pathwayID },
      { onSettled: () => setRemoveTarget(null) },
    )
  }, [patient, removeTarget, removeFromPathway])

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

        {patientPathways.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 flex-shrink-0" />
              <h4 className="text-sm font-semibold text-text-dark">
                Parcours ({patientPathways.length})
              </h4>
              <div className="flex-1 border-t border-border" />
            </div>

            <div className="flex flex-col gap-1.5">
              {patientPathways.map((pathway) => (
                <PathwayCard
                  key={pathway.id}
                  pathwayID={pathway.id}
                  templateName={pathway.templateName}
                  templateColor={pathway.templateColor}
                  startDate={pathway.startDate}
                  onRemove={handleRemoveClick}
                />
              ))}
            </div>
          </>
        )}

        <ConfirmDeleteForm
          open={removeTarget !== null}
          setOpen={(open) => {
            if (!open) setRemoveTarget(null)
          }}
          onConfirm={handleConfirmRemove}
          loading={removeFromPathway.isPending}
          title="Retirer du parcours"
          description={
            removeTarget
              ? `Voulez-vous vraiment retirer ce patient du parcours ${removeTarget.name} ? ${removeTarget.count} rendez-vous seront supprimés. Cette action est irréversible.`
              : ''
          }
        />

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
