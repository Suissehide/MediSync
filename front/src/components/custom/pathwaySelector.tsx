import { keepPreviousData, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  CalendarCheck,
  CalendarX,
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  Loader2,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'

import { PatientApi } from '../../api/patient.api.ts'
import { APPOINTMENT_TYPE_OPTIONS } from '../../constants/appointment.constant.ts'
import { PATIENT } from '../../constants/process.constant.ts'
import { SLOT_DURATIONS } from '../../constants/slot.constant.ts'
import { cn } from '../../libs/utils.ts'
import { usePathwayTemplateQueries } from '../../queries/usePathwayTemplate.ts'
import { useThematicQueries } from '../../queries/useThematic.ts'
import type {
  EnrollmentPreview,
  PathwayEnrollment,
  TimeOfDay,
} from '../../types/patient.ts'
import { DatePicker } from '../ui/datePicker.tsx'
import { FormField } from '../ui/formField.tsx'
import { Input } from '../ui/input.tsx'
import { Label } from '../ui/label.tsx'
import { Select } from '../ui/select.tsx'

const DURATION_OPTIONS = SLOT_DURATIONS.map((d) => ({
  value: String(d),
  label: `${d} minutes`,
}))

export type PathwayPeriod = 'morning' | 'afternoon' | 'fullday'

const PERIOD_TO_TIME_OF_DAY: Record<PathwayPeriod, TimeOfDay> = {
  morning: 'MORNING',
  afternoon: 'AFTERNOON',
  fullday: 'ALL_DAY',
}

const PERIOD_OPTIONS: { value: PathwayPeriod; label: string }[] = [
  { value: 'morning', label: 'Matin' },
  { value: 'afternoon', label: 'Après-midi' },
  { value: 'fullday', label: 'Journée' },
]

export interface AddedPathway {
  id: string
  tag: string
  color: string
  period: PathwayPeriod
  thematicID: string
  thematicDuration: number | null
  type: string
  motif: string
  motifRequired: boolean
  startDate: string
}

export function usePathwaySelector(patientID?: string) {
  const { pathwayTemplates } = usePathwayTemplateQueries()
  const { thematics } = useThematicQueries()
  const [addedPathways, setAddedPathways] = useState<AddedPathway[]>([])
  const [expandedPathwayId, setExpandedPathwayId] = useState<string | null>(
    null,
  )
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const templateOf = useCallback(
    (tag: string) => (pathwayTemplates ?? []).find((t) => t.mainTag === tag),
    [pathwayTemplates],
  )

  const allTags = useMemo(
    () => [...new Set((pathwayTemplates ?? []).map((t) => t.mainTag))].sort(),
    [pathwayTemplates],
  )

  const tagOptions = allTags
    .filter((tag) => !addedPathways.some((p) => p.tag === tag))
    .map((tag) => {
      const template = templateOf(tag)
      return {
        value: tag,
        label: tag,
        color: template?.color,
        hint: template?.firstAppointmentOnly ? 'Individuel' : 'Collectif',
      }
    })

  const handleAddTags = (tags: string[]) => {
    const newPathways = tags.map((tag) => {
      const template = templateOf(tag)
      return {
        id: `${tag}-${Date.now()}-${Math.random()}`,
        tag,
        color: template?.color ?? '#2563eb',
        period: 'fullday' as PathwayPeriod,
        thematicID: '',
        thematicDuration: null,
        type: '',
        motif: '',
        motifRequired: template?.motifRequired ?? false,
        startDate: dayjs.utc().startOf('day').toISOString(),
      }
    })
    setAddedPathways((prev) => [...prev, ...newPathways])
  }

  const enrollments: PathwayEnrollment[] = addedPathways.map((p) => ({
    tag: p.tag,
    timeOfDay: PERIOD_TO_TIME_OF_DAY[p.period],
    thematicID: p.thematicID || undefined,
    type: p.type,
    motif: p.motif || undefined,
    duration: p.thematicDuration ?? undefined,
    startDate: p.startDate,
  }))

  // Sans motif ni type, qui n'influent pas sur le parcours retenu : saisir le motif ne relance pas l'aperçu.
  const previewInput = enrollments.map(({ motif, type, ...rest }) => rest)
  const { data } = useQuery({
    queryKey: [PATIENT.ENROLL_PREVIEW, patientID, previewInput],
    queryFn: () => PatientApi.previewEnrollments(previewInput, patientID),
    enabled: previewInput.length > 0,
    placeholderData: keepPreviousData,
  })
  // Tant que l'aperçu ne correspond pas à la liste (ajout, retrait), on ne l'affiche pas.
  const previews = data?.length === addedPathways.length ? data : undefined

  const plannable = addedPathways.flatMap((p, i) =>
    previews?.[i]?.startDate
      ? [{ pathway: p, enrollment: enrollments[i] }]
      : [],
  )

  const toggleExpand = (pathwayId: string) => {
    setExpandedPathwayId((prev) => (prev === pathwayId ? null : pathwayId))
  }

  const updatePathway = (id: string, updates: Partial<AddedPathway>) => {
    setAddedPathways((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    )
  }

  const handleRemovePathway = (id: string) => {
    setAddedPathways((prev) => prev.filter((p) => p.id !== id))
  }

  const movePathway = (index: number, delta: number) => {
    setAddedPathways((prev) => {
      const target = index + delta
      if (target < 0 || target >= prev.length) {
        return prev
      }
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const handleDragStart = (index: number) => setDraggedIndex(index)

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) {
      return
    }
    movePathway(draggedIndex, index - draggedIndex)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => setDraggedIndex(null)

  const reset = useCallback(() => {
    setAddedPathways([])
    setExpandedPathwayId(null)
    setDraggedIndex(null)
  }, [])

  return {
    enrollments,
    previews,
    plannableEnrollments: plannable.map((p) => p.enrollment),
    // Un parcours planifiable dont le motif obligatoire manque bloque l'inscription.
    missingMotif: plannable.some(
      ({ pathway }) => pathway.motifRequired && !pathway.motif.trim(),
    ),
    tagOptions,
    thematics,
    addedPathways,
    expandedPathwayId,
    draggedIndex,
    handleAddTags,
    toggleExpand,
    updatePathway,
    handleRemovePathway,
    movePathway,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    reset,
  }
}

const SMALL_CAPS =
  'text-[11px] font-semibold uppercase tracking-wide text-text-light'

function PreviewBadge({ preview }: { preview?: EnrollmentPreview }) {
  if (!preview) {
    return (
      <span className="h-[34px] flex items-center gap-2 px-2.5 text-sm text-text-light">
        <Loader2 className="w-4 h-4 animate-spin" />
        Calcul…
      </span>
    )
  }
  if (!preview.startDate) {
    return (
      <span className="h-[34px] flex items-center gap-2 px-2.5 rounded-md bg-red-50 text-red-700 text-sm font-semibold">
        <CalendarX className="w-4 h-4" />
        Aucune date
      </span>
    )
  }
  return (
    <span className="h-[34px] flex items-center gap-2 px-2.5 rounded-md bg-green-50 text-green-700 text-sm font-semibold">
      <CalendarCheck className="w-4 h-4" />
      Départ le {dayjs.utc(preview.startDate).format('DD/MM/YYYY')}
    </span>
  )
}

interface PathwayItemProps {
  pathway: AddedPathway
  index: number
  count: number
  preview?: EnrollmentPreview
  isExpanded: boolean
  isDragged: boolean
  thematicOptions: { value: string; label: string }[]
  thematics: ReturnType<typeof useThematicQueries>['thematics']
  onToggleExpand: () => void
  onRemove: () => void
  onMove: (delta: number) => void
  onUpdate: (updates: Partial<AddedPathway>) => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function PathwayItem({
  pathway,
  index,
  count,
  preview,
  isExpanded,
  isDragged,
  thematicOptions,
  thematics,
  onToggleExpand,
  onRemove,
  onMove,
  onUpdate,
  onDragStart,
  onDragOver,
  onDragEnd,
}: PathwayItemProps) {
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const blocked = !!preview && !preview.startDate

  return (
    <li
      onDragOver={onDragOver}
      className={cn(
        'rounded-lg border bg-white overflow-hidden transition-opacity',
        blocked ? 'border-red-200' : 'border-border',
        isDragged && 'opacity-50',
      )}
    >
      <div className="grid grid-cols-[28px_22px_minmax(0,1fr)_170px_190px_84px] items-center gap-2.5 p-3 pl-2">
        <span className="flex flex-col items-center text-text-light">
          <button
            type="button"
            aria-label="Monter"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="h-4 cursor-pointer disabled:opacity-30 disabled:cursor-default"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Glisser pour réordonner"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="cursor-move text-slate-300"
          >
            <GripHorizontal className="w-3.5 h-3" />
          </button>
          <button
            type="button"
            aria-label="Descendre"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            className="h-4 cursor-pointer disabled:opacity-30 disabled:cursor-default"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </span>

        <span className="w-[22px] h-[22px] rounded-full bg-foreground text-white text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>

        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-foreground min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-[3px] shrink-0"
              style={{ backgroundColor: pathway.color }}
            />
            <span className="truncate">{pathway.tag}</span>
          </span>
          <div className="flex gap-0.5 p-0.5 bg-muted rounded-md self-start">
            {PERIOD_OPTIONS.map((option) => {
              const active = pathway.period === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onUpdate({ period: option.value })}
                  className={cn(
                    'h-6 px-2 rounded text-xs whitespace-nowrap cursor-pointer',
                    active
                      ? 'bg-white text-foreground font-semibold shadow-sm'
                      : 'text-text-light',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={SMALL_CAPS}>Au plus tôt le</span>
          <DatePicker
            aria-label="Au plus tôt le"
            className="h-[34px]"
            open={datePickerOpen}
            onOpen={() => setDatePickerOpen(true)}
            onClose={() => setDatePickerOpen(false)}
            value={dayjs.utc(pathway.startDate)}
            onChange={(date) => {
              if (date?.isValid()) {
                onUpdate({ startDate: date.toISOString() })
              }
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className={SMALL_CAPS}>Résultat</span>
          <PreviewBadge preview={preview} />
        </div>

        <div className="flex gap-1 justify-end">
          <button
            type="button"
            aria-label="Options"
            aria-expanded={isExpanded}
            onClick={onToggleExpand}
            className={cn(
              'w-9 h-[34px] flex items-center justify-center rounded-md border cursor-pointer',
              isExpanded
                ? 'border-primary bg-blue-50 text-primary'
                : 'border-border bg-white text-text-dark',
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Retirer"
            onClick={onRemove}
            className="w-9 h-[34px] flex items-center justify-center rounded-md border border-border bg-white text-red-600 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {blocked && (
        <div className="flex items-center justify-between gap-3 mx-3 mb-3 ml-[68px] px-3 py-2.5 rounded-md bg-red-50 text-[13px] text-red-900">
          <span>{preview.reason}</span>
          <button
            type="button"
            onClick={() => setDatePickerOpen(true)}
            className="shrink-0 h-7 px-2.5 rounded-md border border-red-200 bg-white text-red-700 text-[13px] font-semibold cursor-pointer"
          >
            Choisir une autre date
          </button>
        </div>
      )}

      {pathway.motifRequired && (
        <div className="flex flex-col gap-1 mx-3 mb-3 ml-[68px]">
          <Label htmlFor={`motif-${pathway.id}`} className="text-[13px]">
            Motif <span className="text-red-600">*</span>{' '}
            <span className="font-normal text-text-light">
              · recopié dans les notes de transmission
            </span>
          </Label>
          <Input
            id={`motif-${pathway.id}`}
            type="text"
            value={pathway.motif}
            onChange={(e) => onUpdate({ motif: e.target.value })}
            placeholder="ex. Anxiété post-infarctus"
          />
        </div>
      )}

      {isExpanded && (
        <div className="flex flex-col gap-2.5 py-3.5 pr-3 pl-[68px] border-t border-border bg-slate-50">
          <span className="text-xs text-text-light">
            Options des rendez-vous créés · facultatif
          </span>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
            <FormField>
              <Label htmlFor={`thematic-${pathway.id}`}>Thématique</Label>
              <Select
                id={`thematic-${pathway.id}`}
                searchable
                placeholder="Celle du créneau"
                value={pathway.thematicID}
                options={thematicOptions}
                onValueChange={(value) => {
                  const selected = thematics?.find((t) => t.id === value)
                  onUpdate({
                    thematicID: value,
                    thematicDuration: selected?.duration ?? null,
                  })
                }}
              />
            </FormField>

            <FormField>
              <Label htmlFor={`duration-${pathway.id}`}>Durée</Label>
              <Select
                id={`duration-${pathway.id}`}
                placeholder="Par défaut"
                value={String(pathway.thematicDuration ?? '')}
                options={
                  pathway.thematicDuration &&
                  !DURATION_OPTIONS.some(
                    (o) => o.value === String(pathway.thematicDuration),
                  )
                    ? [
                        ...DURATION_OPTIONS,
                        {
                          value: String(pathway.thematicDuration),
                          label: `${pathway.thematicDuration} minutes`,
                        },
                      ].sort((a, b) => Number(a.value) - Number(b.value))
                    : DURATION_OPTIONS
                }
                onValueChange={(value) =>
                  onUpdate({ thematicDuration: Number(value) })
                }
              />
            </FormField>

            <FormField>
              <Label htmlFor={`type-${pathway.id}`}>Type</Label>
              <Select
                id={`type-${pathway.id}`}
                placeholder="Non précisé"
                value={pathway.type}
                options={APPOINTMENT_TYPE_OPTIONS}
                onValueChange={(value) => onUpdate({ type: value })}
              />
            </FormField>
          </div>
        </div>
      )}
    </li>
  )
}

interface PathwaySelectorProps {
  state: ReturnType<typeof usePathwaySelector>
}

export function PathwaySelector({ state }: PathwaySelectorProps) {
  const {
    tagOptions,
    thematics,
    addedPathways,
    previews,
    expandedPathwayId,
    draggedIndex,
    handleAddTags,
    toggleExpand,
    updatePathway,
    handleRemovePathway,
    movePathway,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = state

  const thematicOptions = (thematics ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }))

  return (
    <div className="w-full flex flex-col gap-4">
      <Select
        searchable
        clearable={false}
        className="h-[42px]"
        icon={<Plus className="w-4 h-4 text-primary shrink-0" />}
        placeholder="Ajouter un parcours…"
        emptyMessage="Tous les parcours sont ajoutés"
        value=""
        options={tagOptions}
        onValueChange={(tag) => tag && handleAddTags([tag])}
      />

      <div className="flex justify-between items-baseline">
        <span className="text-sm font-semibold text-foreground">
          Parcours à inscrire, par priorité
        </span>
        <span className="text-xs text-text-light">
          Le n° 1 est planifié en premier
        </span>
      </div>

      {addedPathways.length === 0 ? (
        <div className="p-8 border border-dashed border-slate-300 rounded-lg text-center text-sm text-text-light">
          Aucun parcours ajouté
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {addedPathways.map((pathway, index) => (
            <PathwayItem
              key={pathway.id}
              pathway={pathway}
              index={index}
              count={addedPathways.length}
              preview={previews?.[index]}
              isExpanded={expandedPathwayId === pathway.id}
              isDragged={draggedIndex === index}
              thematicOptions={thematicOptions}
              thematics={thematics}
              onToggleExpand={() => toggleExpand(pathway.id)}
              onRemove={() => handleRemovePathway(pathway.id)}
              onMove={(delta) => movePathway(index, delta)}
              onUpdate={(updates) => updatePathway(pathway.id, updates)}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
