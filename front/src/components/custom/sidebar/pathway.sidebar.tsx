import { Draggable } from '@fullcalendar/interaction'
import { Loader2Icon, Pencil, Route, Settings } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { hexToRGBA } from '../../../libs/color.ts'
import { usePathwayTemplateQueries } from '../../../queries/usePathwayTemplate.ts'
import { usePathwayTemplateEditStore } from '../../../store/usePathwayTemplateEditStore.ts'
import { usePlanningStore } from '../../../store/usePlanningStore.ts'
import type { PathwayTemplate } from '../../../types/pathwayTemplate.ts'
import { Button } from '../../ui/button.tsx'
import AddPathwayForm from '../popup/addPathwayForm.tsx'
import PathwayTemplateSheet from '../sheet/pathwayTemplateSheet.tsx'

function SidebarPathway() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [openSheetId, setOpenSheetId] = useState('')

  const { pathwayTemplates, isPending } = usePathwayTemplateQueries()
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

  useEffect(() => {
    if (containerRef.current) {
      new Draggable(containerRef.current, {
        itemSelector: 'li[data-pathway-id]',
        // eventData: (el) => ({
        //   id: el.getAttribute('data-pathway-id'),
        //   title: el.getAttribute('data-pathway-name'),
        // }),
      })
    }
  }, [])

  return (
    <>
      <div className="flex justify-between items-center text-text-light pl-2 mb-2">
        <p>Parcours</p>
        <AddPathwayForm />
      </div>
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
        {isPending ? (
          <div className="h-full flex justify-center items-center">
            <Loader2Icon className="size-10 animate-spin text-foreground" />
          </div>
        ) : (
          <ul className="flex-1 flex flex-col min-h-0 space-y-2 overflow-y-auto border-b border-border pb-2">
            {pathwayTemplates?.map((pathwayTemplate) => {
              const isSelected =
                currentPathwayTemplate?.id === pathwayTemplate.id

              return (
                <li
                  key={pathwayTemplate.id}
                  data-pathway-id={pathwayTemplate.id}
                  data-pathway-name={pathwayTemplate.name}
                  className={`group rounded border border-border bg-white transition-all cursor-pointer
                    hover:shadow-md
                    ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}
                  `}
                  style={{
                    borderLeftColor: pathwayTemplate.color,
                    borderLeftWidth: '6px',
                  }}
                >
                  <div className="relative flex items-center gap-3 px-3 py-2">
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
                      style={{
                        backgroundColor: hexToRGBA(pathwayTemplate.color, 0.15),
                        color: pathwayTemplate.color,
                      }}
                    >
                      <Route className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text truncate">
                        {pathwayTemplate.name}
                      </div>
                    </div>

                    <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenSheetId(pathwayTemplate.id)
                        }}
                        className="flex-shrink-0"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditPathwayTemplate(pathwayTemplate)
                        }}
                        className="flex-shrink-0"
                      >
                        <Settings className="w-4 h-4" />
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
