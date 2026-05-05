import { Draggable } from '@fullcalendar/interaction'
import { GripVertical, Loader2Icon, Pencil, Plus, Route } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { hexToRGBA } from '../../../libs/color.ts'
import {
  usePathwayTemplateMutations,
  usePathwayTemplateQueries,
} from '../../../queries/usePathwayTemplate.ts'
import { usePathwayTemplateEditStore } from '../../../store/usePathwayTemplateEditStore.ts'
import { usePlanningStore } from '../../../store/usePlanningStore.ts'
import type { PathwayTemplate } from '../../../types/pathwayTemplate.ts'
import { Button } from '../../ui/button.tsx'
import AddPathwayForm from '../popup/addPathwayForm.tsx'
import PathwayTemplateSheet from '../sheet/pathwayTemplateSheet.tsx'

function SidebarPathway() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [openSheetId, setOpenSheetId] = useState('')
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const { pathwayTemplates, isPending } = usePathwayTemplateQueries()
  const { reorderPathwayTemplates } = usePathwayTemplateMutations()
  const { currentPathwayTemplate, setPathwayTemplate, clearPathwayTemplate } =
    usePathwayTemplateEditStore(
      useShallow((state) => ({
        currentPathwayTemplate: state.currentPathwayTemplate,
        setPathwayTemplate: state.setPathwayTemplate,
        clearPathwayTemplate: state.clearPathwayTemplate,
      })),
    )

  const viewStart = usePlanningStore((state) => state.viewStart)

  const handleEditPathwayTemplate = (pathwayTemplate: PathwayTemplate) => {
    if (currentPathwayTemplate?.id !== pathwayTemplate.id) {
      setPathwayTemplate(pathwayTemplate, viewStart)
    } else {
      clearPathwayTemplate()
    }
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    // Visual reorder is handled by optimistic update in the mutation
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) return
    if (!pathwayTemplates) return

    const newOrder = [...pathwayTemplates]
    const [movedItem] = newOrder.splice(draggedIndex, 1)
    newOrder.splice(dropIndex, 0, movedItem)

    reorderPathwayTemplates.mutate(newOrder.map((t) => t.id))
    setDraggedIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  useEffect(() => {
    if (containerRef.current) {
      new Draggable(containerRef.current, {
        itemSelector: 'li[data-pathway-id]',
      })
    }
  }, [])

  return (
    <>
      <div className="pl-4 pr-2 flex justify-between items-center text-text-sidebar py-2">
        <p>Parcours</p>
        <AddPathwayForm
          trigger={
            <Button variant="gradient" size="icon">
              <Plus className="w-5 h-5" />
            </Button>
          }
        />
      </div>
      <div
        ref={containerRef}
        className="mx-2 px-2 pb-2 flex-1 flex flex-col min-h-0"
      >
        {isPending ? (
          <div className="h-full flex justify-center items-center">
            <Loader2Icon className="size-10 animate-spin text-foreground" />
          </div>
        ) : (
          <ul className="flex-1 flex flex-col min-h-0 space-y-2 overflow-y-auto">
            {pathwayTemplates?.map((pathwayTemplate, index) => {
              const isSelected =
                currentPathwayTemplate?.id === pathwayTemplate.id
              const isDragged = draggedIndex === index

              return (
                <li
                  key={pathwayTemplate.id}
                  data-pathway-id={pathwayTemplate.id}
                  data-pathway-name={pathwayTemplate.name}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleEditPathwayTemplate(pathwayTemplate)}
                  className={`group rounded border transition-all cursor-pointer hover:shadow-md ${
                    isSelected
                      ? 'border-border-dark shadow-sm'
                      : 'border-border-sidebar bg-sidebar'
                  } ${isDragged ? 'opacity-50' : ''}`}
                  style={{
                    borderLeftColor: pathwayTemplate.color,
                    borderLeftWidth: '6px',
                    ...(isSelected && {
                      backgroundColor: hexToRGBA(pathwayTemplate.color, 0.15),
                    }),
                  }}
                >
                  <div className="relative flex items-center gap-3 px-3 py-2">
                    <div className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                      <GripVertical className="w-4 h-4" />
                    </div>

                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
                      style={{
                        backgroundColor: hexToRGBA(
                          pathwayTemplate.color,
                          0.15,
                        ),
                        color: pathwayTemplate.color,
                      }}
                    >
                      <Route className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text truncate">
                        {pathwayTemplate.name}
                      </div>
                      {pathwayTemplate.tags &&
                        pathwayTemplate.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {pathwayTemplate.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/10 leading-none"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                    </div>

                    <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenSheetId(pathwayTemplate.id)
                        }}
                        className="flex-shrink-0"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <PathwayTemplateSheet
        open={!!openSheetId}
        setOpen={setOpenSheetId}
        pathwayTemplateID={openSheetId}
      />
    </>
  )
}

export default SidebarPathway
