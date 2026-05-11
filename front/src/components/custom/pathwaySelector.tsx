import { ChevronDown, ChevronUp, GripVertical, Plus, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useMemo, useState } from 'react'

import { APPOINTMENT_TYPE_OPTIONS } from '../../constants/appointment.constant.ts'
import { SLOT_DURATIONS } from '../../constants/slot.constant.ts'
import { usePathwayTemplateQueries } from '../../queries/usePathwayTemplate.ts'
import { useThematicQueries } from '../../queries/useThematic.ts'
import { Button } from '../ui/button.tsx'
import { FormField } from '../ui/formField.tsx'
import { Input } from '../ui/input.tsx'
import { Label } from '../ui/label.tsx'
import { MultiSelect, Select } from '../ui/select.tsx'

const DURATION_OPTIONS = SLOT_DURATIONS.map((d) => ({
  value: String(d),
  label: `${d} minutes`,
}))

export type PathwayPeriod = 'morning' | 'afternoon' | 'fullday'

export interface AddedPathway {
  id: string
  tag: string
  period: PathwayPeriod
  thematicID: string
  thematicName: string
  thematicDuration: number | null
  type: string
  motif: string
  motifRequired: boolean
}

export function usePathwaySelector() {
  const { pathwayTemplates } = usePathwayTemplateQueries()
  const { thematics } = useThematicQueries()
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [addedPathways, setAddedPathways] = useState<AddedPathway[]>([])
  const [expandedPathwayId, setExpandedPathwayId] = useState<string | null>(
    null,
  )
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const allTags = useMemo(
    () =>
      [
        ...new Set((pathwayTemplates ?? []).flatMap((t) => t.tags ?? [])),
      ].sort(),
    [pathwayTemplates],
  )

  const tagOptions = allTags.map((tag) => ({ value: tag, label: tag }))

  const handleAddTags = () => {
    const newPathways = selectedTags.map((tag) => {
      const template = (pathwayTemplates ?? []).find((t) =>
        t.tags?.includes(tag),
      )
      return {
        id: `${tag}-${Date.now()}-${Math.random()}`,
        tag,
        period: 'fullday' as PathwayPeriod,
        thematicID: '',
        thematicName: '',
        thematicDuration: null,
        type: '',
        motif: '',
        motifRequired: template?.motifRequired ?? false,
      }
    })
    setAddedPathways((prev) => [...prev, ...newPathways])
    setSelectedTags([])

    const firstMotifRequired = newPathways.find((p) => p.motifRequired)
    if (firstMotifRequired) {
      setExpandedPathwayId(firstMotifRequired.id)
    }
  }

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

  const handleDragStart = (index: number) => setDraggedIndex(index)

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) {
      return
    }
    setAddedPathways((prev) => {
      const next = [...prev]
      const item = next[draggedIndex]
      next.splice(draggedIndex, 1)
      next.splice(index, 0, item)
      return next
    })
    setDraggedIndex(index)
  }

  const handleDragEnd = () => setDraggedIndex(null)

  const reset = useCallback(() => {
    setSelectedTags([])
    setAddedPathways([])
    setExpandedPathwayId(null)
    setDraggedIndex(null)
  }, [])

  return {
    tagOptions,
    selectedTags,
    setSelectedTags,
    thematics,
    addedPathways,
    expandedPathwayId,
    draggedIndex,
    handleAddTags,
    toggleExpand,
    updatePathway,
    handleRemovePathway,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    reset,
  }
}

const PERIOD_LABELS: Record<PathwayPeriod, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  fullday: 'Journée complète',
}

const PERIOD_OPTIONS: { value: PathwayPeriod; label: string }[] = [
  { value: 'morning', label: 'Matin' },
  { value: 'afternoon', label: 'Après-midi' },
  { value: 'fullday', label: 'Journée complète' },
]

interface PathwayItemProps {
  pathway: AddedPathway
  isExpanded: boolean
  isDragged: boolean
  thematicOptions: { value: string; label: string }[]
  thematics: ReturnType<typeof useThematicQueries>['thematics']
  onToggleExpand: () => void
  onRemove: () => void
  onUpdate: (updates: Partial<AddedPathway>) => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function PathwayItem({
  pathway,
  isExpanded,
  isDragged,
  thematicOptions,
  thematics,
  onToggleExpand,
  onRemove,
  onUpdate,
  onDragStart,
  onDragOver,
  onDragEnd,
}: PathwayItemProps) {
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`rounded-md border border-border bg-white transition-all ${
        isDragged ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 cursor-move">
        <GripVertical className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{pathway.tag}</div>
          <div className="text-xs text-neutral-500 flex gap-2 flex-wrap mt-0.5">
            <span>{PERIOD_LABELS[pathway.period]}</span>
            {pathway.type && (
              <>
                <span>•</span>
                <span>{pathway.type}</span>
              </>
            )}
            {pathway.thematicName && (
              <>
                <span>•</span>
                <span>
                  {pathway.thematicName}
                  {pathway.thematicDuration
                    ? ` (${pathway.thematicDuration} min)`
                    : ''}
                </span>
              </>
            )}
            {pathway.motif && (
              <>
                <span>•</span>
                <span>Motif: {pathway.motif}</span>
              </>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleExpand}
          className="flex-shrink-0"
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="flex-shrink-0 text-red-500 hover:text-red-700"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 pt-2 border-t border-border bg-neutral-50 flex flex-col gap-3">
          <FormField className="flex-1">
            <Label>Période</Label>
            <div className="flex gap-3">
              {PERIOD_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="radio"
                    name={`period-${pathway.id}`}
                    value={option.value}
                    checked={pathway.period === option.value}
                    onChange={(e) =>
                      onUpdate({ period: e.target.value as PathwayPeriod })
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </FormField>

          <div className="flex gap-4">
            <FormField className="flex-1">
              <Label htmlFor={`thematic-${pathway.id}`}>Thématique</Label>
              <Select
                id={`thematic-${pathway.id}`}
                searchable
                value={pathway.thematicID}
                options={thematicOptions}
                onValueChange={(value) => {
                  const selected = thematics?.find((t) => t.id === value)
                  onUpdate({
                    thematicID: value,
                    thematicName: selected?.name ?? '',
                    thematicDuration: selected?.duration ?? null,
                  })
                }}
              />
            </FormField>

            <FormField className="w-48">
              <Label htmlFor={`duration-${pathway.id}`}>Durée</Label>
              <Select
                id={`duration-${pathway.id}`}
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
          </div>

          <FormField className="flex-1">
            <Label htmlFor={`type-${pathway.id}`}>Type</Label>
            <Select
              id={`type-${pathway.id}`}
              value={pathway.type}
              options={APPOINTMENT_TYPE_OPTIONS}
              onValueChange={(value) => onUpdate({ type: value })}
            />
          </FormField>

          {pathway.motifRequired && (
            <FormField className="flex-1">
              <Label htmlFor={`motif-${pathway.id}`}>Motif *</Label>
              <Input
                id={`motif-${pathway.id}`}
                type="text"
                value={pathway.motif}
                onChange={(e) => onUpdate({ motif: e.target.value })}
                placeholder="Saisir le motif..."
              />
            </FormField>
          )}
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
    selectedTags,
    setSelectedTags,
    thematics,
    addedPathways,
    expandedPathwayId,
    draggedIndex,
    handleAddTags,
    toggleExpand,
    updatePathway,
    handleRemovePathway,
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
      <div className="flex gap-2 items-end">
        <FormField className="flex-1">
          <Label>Parcours disponibles</Label>
          <MultiSelect
            options={tagOptions}
            value={selectedTags}
            onChange={setSelectedTags}
            placeholder="Sélectionner un ou plusieurs parcours"
          />
        </FormField>
        <Button
          variant="default"
          size="default"
          type="button"
          onClick={handleAddTags}
          disabled={selectedTags.length === 0}
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </Button>
      </div>

      <div className="flex-1">
        <Label className="mb-2 block">
          Parcours ajoutés ({addedPathways.length})
        </Label>
        <div className="p-3 bg-input rounded">
          {addedPathways.length === 0 ? (
            <div className="text-sm text-neutral-400 text-center py-8 border border-dashed border-border rounded-md">
              Aucun parcours ajouté
            </div>
          ) : (
            <ul className="space-y-2">
              {addedPathways.map((pathway, index) => (
                <PathwayItem
                  key={pathway.id}
                  pathway={pathway}
                  isExpanded={expandedPathwayId === pathway.id}
                  isDragged={draggedIndex === index}
                  thematicOptions={thematicOptions}
                  thematics={thematics}
                  onToggleExpand={() => toggleExpand(pathway.id)}
                  onRemove={() => handleRemovePathway(pathway.id)}
                  onUpdate={(updates) => updatePathway(pathway.id, updates)}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
