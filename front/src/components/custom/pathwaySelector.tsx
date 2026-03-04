import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  X,
} from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'

import { APPOINTMENT_TYPE_OPTIONS } from '../../constants/appointment.constant.ts'
import { usePathwayTemplateQueries } from '../../queries/usePathwayTemplate.ts'
import { Button } from '../ui/button.tsx'
import { FormField } from '../ui/formField.tsx'
import { Label } from '../ui/label.tsx'
import { MultiSelect, Select } from '../ui/select.tsx'

export type PathwayPeriod = 'morning' | 'afternoon' | 'fullday'

export interface AddedPathway {
  id: string
  pathwayTemplateId: string
  name: string
  color: string
  period: PathwayPeriod
  thematic: string
  type: string
}

export function usePathwaySelector() {
  const { pathwayTemplates } = usePathwayTemplateQueries()
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedPathways, setSelectedPathways] = useState<string[]>([])
  const [addedPathways, setAddedPathways] = useState<AddedPathway[]>([])
  const [expandedPathwayId, setExpandedPathwayId] = useState<string | null>(
    null,
  )
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const allTags = useMemo(
    () =>
      [...new Set((pathwayTemplates ?? []).flatMap((t) => t.tags ?? []))].sort(),
    [pathwayTemplates],
  )

  const filteredPathwayTemplates = useMemo(() => {
    if (selectedTags.length === 0) return pathwayTemplates ?? []
    return (pathwayTemplates ?? []).filter((t) =>
      selectedTags.some((tag) => t.tags?.includes(tag)),
    )
  }, [pathwayTemplates, selectedTags])

  const pathwayOptions = filteredPathwayTemplates.map((pt) => ({
    value: pt.id,
    label: pt.name,
    color: pt.color,
  }))

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
    setSelectedPathways([])
  }

  const handleAddPathways = () => {
    const newPathways = selectedPathways
      .filter((id) => !addedPathways.some((p) => p.pathwayTemplateId === id))
      .map((id) => {
        const template = pathwayTemplates?.find((pt) => pt.id === id)
        return {
          id: `${id}-${Date.now()}`,
          pathwayTemplateId: id,
          name: template?.name ?? '',
          color: template?.color ?? '#000000',
          period: 'fullday' as PathwayPeriod,
          thematic: '',
          type: '',
        }
      })
    setAddedPathways((prev) => [...prev, ...newPathways])
    setSelectedPathways([])
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
    if (draggedIndex === null || draggedIndex === index) return
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

  const reset = () => {
    setSelectedTags([])
    setSelectedPathways([])
    setAddedPathways([])
    setExpandedPathwayId(null)
    setDraggedIndex(null)
  }

  return {
    allTags,
    selectedTags,
    filteredPathwayTemplates,
    pathwayOptions,
    selectedPathways,
    setSelectedPathways,
    addedPathways,
    expandedPathwayId,
    draggedIndex,
    toggleTag,
    handleAddPathways,
    toggleExpand,
    updatePathway,
    handleRemovePathway,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    reset,
  }
}

interface PathwaySelectorProps {
  state: ReturnType<typeof usePathwaySelector>
}

export function PathwaySelector({ state }: PathwaySelectorProps) {
  const {
    allTags,
    selectedTags,
    filteredPathwayTemplates,
    pathwayOptions,
    selectedPathways,
    setSelectedPathways,
    addedPathways,
    expandedPathwayId,
    draggedIndex,
    toggleTag,
    handleAddPathways,
    toggleExpand,
    updatePathway,
    handleRemovePathway,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = state

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex-1">
        {allTags.length > 0 && (
          <div className="mb-3">
            <Label className="mb-1.5 block">Filtrer par tag</Label>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => {
                const isActive = selectedTags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary hover:text-primary'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <FormField className="flex-1">
            <Label>
              Parcours disponibles
              {selectedTags.length > 0 && (
                <span className="ml-1 text-muted-foreground font-normal">
                  ({filteredPathwayTemplates.length})
                </span>
              )}
            </Label>
            <MultiSelect
              options={pathwayOptions}
              value={selectedPathways}
              onChange={setSelectedPathways}
              placeholder="Sélectionner un ou plusieurs parcours"
            />
          </FormField>
          <Button
            variant="default"
            size="default"
            type="button"
            onClick={handleAddPathways}
            disabled={selectedPathways.length === 0}
          >
            <Plus className="w-4 h-4" />
            Ajouter
          </Button>
        </div>
      </div>

      <div className="flex-1">
        <Label className="mb-2 block">
          Parcours ajoutés ({addedPathways.length})
        </Label>
        {addedPathways.length === 0 ? (
          <div className="text-sm text-neutral-400 text-center py-8 border border-dashed border-border rounded-md">
            Aucun parcours ajouté
          </div>
        ) : (
          <ul className="space-y-2">
            {addedPathways.map((pathway, index) => {
              const isExpanded = expandedPathwayId === pathway.id
              return (
                <li
                  key={pathway.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`rounded-md border border-border bg-white transition-all ${
                    draggedIndex === index ? 'opacity-50' : 'opacity-100'
                  }`}
                  style={{
                    borderLeftColor: pathway.color,
                    borderLeftWidth: '4px',
                  }}
                >
                  <div className="flex items-center gap-2 px-3 py-2 cursor-move">
                    <GripVertical className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {pathway.name}
                      </div>
                      <div className="text-xs text-neutral-500 flex gap-2 flex-wrap mt-0.5">
                        <span>
                          {pathway.period === 'morning'
                            ? 'Matin'
                            : pathway.period === 'afternoon'
                              ? 'Après-midi'
                              : 'Journée complète'}
                        </span>
                        {pathway.type && (
                          <>
                            <span>•</span>
                            <span>{pathway.type}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpand(pathway.id)}
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
                      onClick={() => handleRemovePathway(pathway.id)}
                      className="flex-shrink-0 text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-2 border-t border-border bg-neutral-50">
                      <div
                        className="mb-2 h-2 rounded-full"
                        style={{ backgroundColor: pathway.color }}
                      />
                      <FormField>
                        <Label>Période</Label>
                        <div>
                          {(
                            [
                              { value: 'morning' as PathwayPeriod, label: 'Matin' },
                              { value: 'afternoon' as PathwayPeriod, label: 'Après-midi' },
                              { value: 'fullday' as PathwayPeriod, label: 'Journée complète' },
                            ] as const
                          ).map((option) => (
                            <label
                              key={option.value}
                              className="flex items-center gap-2 cursor-pointer hover:bg-neutral-100 p-2 rounded"
                            >
                              <input
                                type="radio"
                                name={`period-${pathway.id}`}
                                value={option.value}
                                checked={pathway.period === option.value}
                                onChange={(e) =>
                                  updatePathway(pathway.id, {
                                    period: e.target.value as PathwayPeriod,
                                  })
                                }
                                className="w-4 h-4"
                              />
                              <span className="text-sm">{option.label}</span>
                            </label>
                          ))}
                        </div>
                      </FormField>

                      <FormField>
                        <Label htmlFor={`type-${pathway.id}`}>Type</Label>
                        <Select
                          id={`type-${pathway.id}`}
                          value={pathway.type}
                          options={APPOINTMENT_TYPE_OPTIONS}
                          onValueChange={(value) =>
                            updatePathway(pathway.id, { type: value })
                          }
                        />
                      </FormField>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
