import dayjs from 'dayjs'
import {
  AlertTriangle,
  ChevronRight,
  Eye,
  GripVertical,
  Siren,
  X,
} from 'lucide-react'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'

import { PatientApi } from '../../../../api/patient.api.ts'
import {
  ecartEnJours,
  getPathwayProgress,
  getPathwayStartDates,
  getSlotDisplayRange,
  groupSlotsByDay,
  jourRelatif,
  MAX_JOURS_RELATIFS,
  type PathwayProgress,
  splitPatientSlots,
} from '../../../../libs/slotAvailability.ts'
import {
  usePatientMutations,
  usePatientPathwaysQuery,
} from '../../../../queries/usePatient.tsx'
import { usePatientSlotsQuery } from '../../../../queries/useSlot.ts'
import type {
  EnrollmentIssue,
  Patient,
  PatientPathway,
} from '../../../../types/patient.ts'
import type { Slot } from '../../../../types/slot.ts'
import { Button } from '../../../ui/button.tsx'
import { StatutPresence } from '../../pastillePresence.tsx'
import { ConfirmDeleteForm } from '../../popup/confirmDeleteForm.tsx'
import AppointmentSheet from '../../sheet/appointmentSheet.tsx'

interface OverviewPatientProps {
  patient?: Patient
  /** Bascule vers l'onglet Planning : il appartient à la fiche, pas à l'aperçu. */
  onOpenPlanning?: () => void
}

/** Journées montrées avant « Voir plus de rendez-vous ». */
const JOURS_VISIBLES = 3

const HORS_PARCOURS = '#cbd5e1'

type Parcours = { nom: string; couleur: string }

const majuscule = (texte: string) => texte.replace(/^./, (c) => c.toUpperCase())

function ProchainRendezVous({
  slot,
  patientID,
  parcours,
  onOpen,
}: {
  slot: Slot
  patientID?: string
  parcours: Parcours | null
  onOpen: (slot: Slot) => void
}) {
  const { start, end } = getSlotDisplayRange(slot, patientID)
  const debut = dayjs.utc(start)
  const lieu = slot.slotTemplate?.location?.name
  const soignants = slot.slotTemplate?.soignants
  const intitule = soignants?.length
    ? soignants.map((s) => s.name).join(', ')
    : slot.slotTemplate?.thematic || 'Rendez-vous'

  return (
    <div className="flex items-center gap-5 px-5 py-4 rounded-[10px] border border-blue-200 bg-blue-50">
      <div className="flex flex-col items-center justify-center w-16 h-16 flex-shrink-0 rounded-[10px] bg-background border border-blue-200">
        <span className="text-[11px] font-semibold uppercase text-primary">
          {debut.format('ddd')}
        </span>
        <span className="text-2xl font-bold leading-none text-foreground">
          {debut.format('D')}
        </span>
        <span className="text-[11px] text-text-light">
          {debut.format('MMM')}
        </span>
      </div>

      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          Prochain rendez-vous · {jourRelatif(ecartEnJours(start))}
        </span>
        <span className="text-[17px] font-semibold text-foreground truncate">
          {debut.format('HH:mm')} – {dayjs.utc(end).format('HH:mm')} ·{' '}
          {intitule}
        </span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
          <span
            aria-hidden="true"
            className="size-2.5 flex-shrink-0 rounded-sm"
            style={{ backgroundColor: parcours?.couleur ?? HORS_PARCOURS }}
          />
          <span className="truncate">
            {parcours?.nom ?? 'Hors parcours'}
            {lieu && ` · ${lieu}`}
          </span>
        </span>
      </div>

      <Button
        variant="outline"
        onClick={() => onOpen(slot)}
        className="flex-shrink-0 border-blue-200 bg-background text-primary"
      >
        <Eye className="w-4 h-4" />
        Ouvrir
      </Button>
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
  const startDate = dayjs.utc(issue.startDate).format('DD/MM/YYYY')
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

function PathwayRow({
  pathway,
  startDate,
  progress,
  index,
  isDragged,
  onDragStart,
  onDragOver,
  onDragEnd,
  onRemove,
}: {
  pathway: PatientPathway
  startDate: string
  progress?: PathwayProgress
  index: number
  isDragged: boolean
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDragEnd: () => void
  onRemove: (pathwayID: string) => void
}) {
  const couleur = pathway.templateColor ?? HORS_PARCOURS
  const label = pathway.templateMainTag ?? pathway.templateName ?? 'Parcours'
  const debut = majuscule(dayjs.utc(startDate).format('D MMM YYYY'))

  return (
    <li
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={`grid grid-cols-[16px_minmax(0,1fr)_28px] gap-3 items-center p-3.5 border-b border-muted last:border-b-0 transition-opacity ${
        isDragged ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <GripVertical className="h-4 w-4 text-border-dark cursor-grab" />

      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center justify-between gap-2.5">
          <span className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden="true"
              className="size-2.5 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: couleur }}
            />
            <span className="text-[15px] font-semibold text-foreground truncate">
              {label}
            </span>
          </span>
          <span className="flex-shrink-0 text-[13px] text-muted-foreground">
            Début {debut}
          </span>
        </div>

        {progress && (
          <div className="flex items-center gap-2.5">
            <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <span
                className="block h-full rounded-full"
                style={{
                  backgroundColor: couleur,
                  width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
            </span>
            <span className="flex-shrink-0 text-xs text-text-light tabular-nums">
              {progress.done} / {progress.total} réalisés
            </span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onRemove(pathway.pathwayID)}
        className="cursor-pointer size-7 flex items-center justify-center rounded-md text-text-light hover:bg-red-50 hover:text-destructive transition-colors"
        aria-label="Retirer du parcours"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

function AppointmentRow({
  slot,
  patientID,
  parcours,
  aVenir,
  onOpen,
}: {
  slot: Slot
  patientID?: string
  parcours: Parcours | null
  aVenir: boolean
  onOpen: (slot: Slot) => void
}) {
  const { start, end } = getSlotDisplayRange(slot, patientID)
  const lieu = slot.slotTemplate?.location?.name
  const soignants = slot.slotTemplate?.soignants
  const intitule = soignants?.length
    ? soignants.map((s) => s.name).join(', ')
    : slot.slotTemplate?.thematic || 'Rendez-vous'
  const status = slot.appointments
    ?.flatMap((a) => a.appointmentPatients ?? [])
    .find((ap) => ap.patient.id === patientID)?.status

  return (
    <button
      type="button"
      onClick={() => onOpen(slot)}
      className="cursor-pointer grid grid-cols-[92px_4px_minmax(0,1fr)_auto_28px] gap-3 items-center py-2.5 pl-4 pr-3 border-b border-muted last:border-b-0 text-left hover:bg-input transition-colors"
    >
      <span className="text-sm font-semibold text-foreground tabular-nums">
        {dayjs.utc(start).format('HH:mm')} – {dayjs.utc(end).format('HH:mm')}
      </span>

      <span
        aria-hidden="true"
        className="w-1 h-8 rounded-full"
        style={{ backgroundColor: parcours?.couleur ?? HORS_PARCOURS }}
      />

      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {intitule}
          {lieu && (
            <span className="font-normal text-text-light"> · {lieu}</span>
          )}
        </span>
        <span className="text-xs text-text-light truncate">
          {parcours?.nom ?? 'Hors parcours'}
        </span>
      </span>

      <StatutPresence status={status} aVenir={aVenir} />

      <ChevronRight
        className="h-4 w-4 text-text-sidebar justify-self-end"
        aria-hidden="true"
      />
    </button>
  )
}

export default function OverviewPatient({
  patient,
  onOpenPlanning,
}: OverviewPatientProps) {
  const { slots } = usePatientSlotsQuery(patient?.id)
  const { dismissEnrollmentIssue, removeFromPathway, reorderPathways } =
    usePatientMutations()
  const { pathways: patientPathways = [] } = usePatientPathwaysQuery(
    patient?.id ?? '',
  )

  const patientSlots = useMemo(
    () => splitPatientSlots(slots, patient?.id),
    [slots, patient],
  )

  const pathwayStartDates = useMemo(
    () => getPathwayStartDates(slots, patient?.id),
    [slots, patient],
  )

  const pathwayProgress = useMemo(
    () => getPathwayProgress(slots, patient?.id),
    [slots, patient],
  )

  // Nom et couleur du parcours d'un créneau : les parcours DU PATIENT les portent déjà, le
  // créneau ne porte que l'identifiant.
  const parcoursParID = useMemo(
    () =>
      new Map<string, Parcours>(
        patientPathways.map((pathway) => [
          pathway.pathwayID,
          {
            nom: pathway.templateMainTag ?? pathway.templateName ?? 'Parcours',
            couleur: pathway.templateColor ?? HORS_PARCOURS,
          },
        ]),
      ),
    [patientPathways],
  )

  const parcoursDuSlot = useCallback(
    (slot: Slot) => parcoursParID.get(slot.pathway?.id ?? '') ?? null,
    [parcoursParID],
  )

  const [onglet, setOnglet] = useState<'upcoming' | 'past'>('upcoming')
  const [toutDeplie, setToutDeplie] = useState(false)

  const liste =
    onglet === 'upcoming' ? patientSlots.upcoming : patientSlots.past
  const jours = useMemo(
    () => groupSlotsByDay(liste, patient?.id),
    [liste, patient],
  )
  const joursAffiches = toutDeplie ? jours : jours.slice(0, JOURS_VISIBLES)
  const resteAVoir = jours.length > joursAffiches.length

  const changerOnglet = (prochain: 'upcoming' | 'past') => {
    setOnglet(prochain)
    setToutDeplie(false)
  }

  const [removeTarget, setRemoveTarget] = useState<{
    pathwayID: string
    name: string
    count: number
  } | null>(null)

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [openAppointment, setOpenAppointment] = useState<{
    id: string
    slot: Slot
  } | null>(null)

  const handleOpenAppointment = useCallback(
    (slot: Slot) => {
      const appointment = slot.appointments?.find((a) =>
        a.appointmentPatients?.some((ap) => ap.patient.id === patient?.id),
      )
      if (appointment) {
        setOpenAppointment({ id: appointment.id, slot })
      }
    },
    [patient],
  )

  const handleDragStart = useCallback(
    (index: number) => setDraggedIndex(index),
    [],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault()
      if (!patient || draggedIndex === null || draggedIndex === index) {
        return
      }

      const next = [...patientPathways]
      const [moved] = next.splice(draggedIndex, 1)
      next.splice(index, 0, moved)
      setDraggedIndex(index)

      reorderPathways.mutate({
        patientID: patient.id,
        pathwayIDs: next.map((p) => p.pathwayID),
      })
    },
    [draggedIndex, patientPathways, patient, reorderPathways],
  )

  const handleDragEnd = useCallback(() => setDraggedIndex(null), [])

  const handleRemoveClick = useCallback(
    async (pathwayID: string) => {
      if (!patient) {
        return
      }
      const { count } = await PatientApi.getAppointmentsCountInPathway(
        patient.id,
        pathwayID,
      )
      const pathway = patientPathways.find((p) => p.pathwayID === pathwayID)
      const label =
        pathway?.templateMainTag ?? pathway?.templateName ?? 'Parcours'
      setRemoveTarget({
        pathwayID,
        name: label,
        count,
      })
    },
    [patient, patientPathways],
  )

  const handleConfirmRemove = useCallback(() => {
    if (!patient || !removeTarget) {
      return
    }
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

  const prochain = patientSlots.upcoming[0]

  return (
    <div className="mt-4">
      <div className="relative h-fit flex-1 flex flex-col gap-5">
        {enrollmentIssues && enrollmentIssues.length > 0 && (
          <div className="flex flex-col gap-2">
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
          </div>
        )}

        {prochain && (
          <ProchainRendezVous
            slot={prochain}
            patientID={patient?.id}
            parcours={parcoursDuSlot(prochain)}
            onOpen={handleOpenAppointment}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-6 items-start">
          <section className="flex flex-col gap-3 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-base font-semibold text-foreground">
                Parcours{' '}
                <span className="font-normal text-text-light">
                  ({patientPathways.length})
                </span>
              </h4>
              {patientPathways.length > 1 && (
                <span className="text-xs text-text-light">
                  Glisser pour changer la priorité
                </span>
              )}
            </div>

            <ul className="flex flex-col border border-border rounded-[10px] overflow-hidden">
              {patientPathways.length > 0 ? (
                patientPathways.map((pathway, index) => (
                  <PathwayRow
                    key={pathway.pathwayID}
                    pathway={pathway}
                    startDate={
                      pathwayStartDates.get(pathway.pathwayID) ??
                      pathway.startDate
                    }
                    progress={pathwayProgress.get(pathway.pathwayID)}
                    index={index}
                    isDragged={draggedIndex === index}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onRemove={handleRemoveClick}
                  />
                ))
              ) : (
                <li className="p-5 text-sm text-text-light">
                  Aucun parcours. Inscrivez le patient à un parcours pour
                  planifier ses rendez-vous.
                </li>
              )}
            </ul>
          </section>

          <section className="flex flex-col gap-3 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-base font-semibold text-foreground">
                Rendez-vous
              </h4>
              <div
                role="tablist"
                aria-label="Rendez-vous à venir ou passés"
                className="flex gap-0.5 p-[3px] bg-muted rounded-lg"
              >
                {(
                  [
                    ['upcoming', 'À venir', patientSlots.upcoming.length],
                    ['past', 'Passés', patientSlots.past.length],
                  ] as const
                ).map(([valeur, label, total]) => (
                  <button
                    key={valeur}
                    type="button"
                    role="tab"
                    aria-selected={onglet === valeur}
                    onClick={() => changerOnglet(valeur)}
                    className={`cursor-pointer h-7 px-3 rounded-md text-[13px] transition-colors ${
                      onglet === valeur
                        ? 'bg-background font-semibold text-foreground shadow-sm'
                        : 'text-text-light'
                    }`}
                  >
                    {label} · {total}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col border border-border rounded-[10px] overflow-hidden">
              {joursAffiches.map(({ day, slots: slotsDuJour }) => {
                const ecart = ecartEnJours(day)
                return (
                  <div key={day} className="flex flex-col">
                    <div className="flex items-center gap-2 px-4 py-2 bg-input border-b border-border text-[13px] font-semibold text-text-dark">
                      {majuscule(dayjs.utc(day).format('dddd D MMMM'))}
                      {Math.abs(ecart) <= MAX_JOURS_RELATIFS && (
                        <span className="font-normal text-text-light">
                          · {jourRelatif(ecart)}
                        </span>
                      )}
                    </div>
                    {slotsDuJour.map((slot) => (
                      <AppointmentRow
                        key={slot.id}
                        slot={slot}
                        patientID={patient?.id}
                        parcours={parcoursDuSlot(slot)}
                        aVenir={onglet === 'upcoming'}
                        onOpen={handleOpenAppointment}
                      />
                    ))}
                  </div>
                )
              })}

              {jours.length === 0 && (
                <p className="p-5 text-sm text-text-light">
                  {onglet === 'upcoming'
                    ? 'Aucun rendez-vous à venir'
                    : 'Aucun rendez-vous passé'}
                </p>
              )}

              {jours.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    resteAVoir ? setToutDeplie(true) : onOpenPlanning?.()
                  }
                  className="cursor-pointer h-11 text-sm font-semibold text-primary hover:bg-input transition-colors"
                >
                  {resteAVoir
                    ? 'Voir plus de rendez-vous'
                    : 'Ouvrir le planning complet'}
                </button>
              )}
            </div>
          </section>
        </div>

        <ConfirmDeleteForm
          open={removeTarget !== null}
          setOpen={(open) => {
            if (!open) {
              setRemoveTarget(null)
            }
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
      </div>

      <AppointmentSheet
        open={!!openAppointment}
        setOpen={(id) => {
          if (!id) {
            setOpenAppointment(null)
          }
        }}
        eventID={openAppointment?.id ?? ''}
        soignants={openAppointment?.slot.slotTemplate?.soignants ?? []}
      />
    </div>
  )
}
