import { Draggable } from '@fullcalendar/interaction'
import { Loader2Icon, Pencil, Route, Settings } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import {
  getContrastTextColor,
  hexToRGBA,
  parseRGBA,
} from '../../../libs/color.ts'
import { usePathwayTemplateQueries } from '../../../queries/usePathwayTemplate.ts'
import { usePathwayTemplateEditStore } from '../../../store/usePathwayTemplateEditStore.ts'
import { usePlanningStore } from '../../../store/usePlanningStore.ts'
import type { PathwayTemplate } from '../../../types/pathwayTemplate.ts'
import { Button } from '../../ui/button.tsx'
import AddPathwayForm from '../Popup/addPathwayForm.tsx'

function SidebarPathway() {
  const containerRef = useRef<HTMLDivElement>(null)

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
      <div ref={containerRef}>
        {isPending ? (
          <div className="h-full flex justify-center items-center">
            <Loader2Icon className="size-10 animate-spin text-foreground" />
          </div>
        ) : (
          <ul>
            {pathwayTemplates?.map((pathwayTemplate) => {
              const backgroundColor =
                currentPathwayTemplate?.id === pathwayTemplate.id
                  ? hexToRGBA(pathwayTemplate.color, 1)
                  : hexToRGBA(pathwayTemplate.color, 0.6)
              const contrastedColor = getContrastTextColor(
                parseRGBA(backgroundColor),
              )

              return (
                <li
                  key={pathwayTemplate.id}
                  data-pathway-id={pathwayTemplate.id}
                  data-pathway-name={pathwayTemplate.name}
                  className="w-full py-2 px-2 flex items-center justify-between rounded-lg hover:bg-primary/15 cursor-pointer"
                  style={{
                    backgroundColor,
                    color: contrastedColor,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Route className="w-5 h-5" />
                    {pathwayTemplate.name}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="none"
                      size="icon-sm"
                      onClick={() => {
                        console.log('edit')
                      }}
                    >
                      <Pencil
                        className="w-4 h-4 text-primary"
                        style={{
                          color: contrastedColor,
                        }}
                      />
                    </Button>
                    <Button
                      variant="none"
                      size="icon-sm"
                      onClick={() => handleEditPathwayTemplate(pathwayTemplate)}
                    >
                      <Settings
                        className="w-4 h-4 text-primary"
                        style={{
                          color: contrastedColor,
                        }}
                      />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

export default SidebarPathway
