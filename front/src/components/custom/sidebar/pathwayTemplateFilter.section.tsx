import { CheckCheck, Loader2Icon, Route, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { hexToRGBA } from '../../../libs/color.ts'
import { usePathwayTemplateQueries } from '../../../queries/usePathwayTemplate.ts'
import { useDashboardFilterStore } from '../../../store/useDashboardFilterStore.ts'
import { selectionPillClass } from './sidebarFilter.styles.ts'

interface PathwayTemplateFilterSectionProps {
  /** Titre de la section : texte simple ou sélecteur de mode. */
  title: ReactNode
  /** Bouton d'ajout facultatif, aligné à droite du titre. */
  addAction?: ReactNode
}

function PathwayTemplateFilterSection({
  title,
  addAction,
}: PathwayTemplateFilterSectionProps) {
  const { pathwayTemplates, isPending } = usePathwayTemplateQueries()

  const togglePathwayTemplate = useDashboardFilterStore(
    (state) => state.togglePathwayTemplate,
  )
  const selectAllPathwayTemplates = useDashboardFilterStore(
    (state) => state.selectAllPathwayTemplates,
  )
  const unselectPathwayTemplates = useDashboardFilterStore(
    (state) => state.unselectPathwayTemplates,
  )
  const selectedPathwayTemplateIDs = useDashboardFilterStore(
    (state) => state.selectedPathwayTemplateIDs,
  )

  const templates = pathwayTemplates ?? []

  return (
    <>
      <div className="pl-4 pr-2 flex justify-between items-center text-text-sidebar py-2">
        <div className="flex items-center gap-2 min-w-0">
          {title}
          {templates.length > 0 &&
            (selectedPathwayTemplateIDs.length > 0 ? (
              <button
                type="button"
                onClick={() => unselectPathwayTemplates()}
                className={selectionPillClass}
              >
                <X className="w-3 h-3" />
                Tout décocher
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  selectAllPathwayTemplates(templates.map((t) => t.id))
                }
                className={selectionPillClass}
              >
                <CheckCheck className="w-3 h-3" />
                Tout cocher
              </button>
            ))}
        </div>
        {addAction}
      </div>

      {isPending ? (
        <div className="mx-2 px-2 py-2 bg-sidebar flex-1 flex justify-center items-center rounded-lg">
          <Loader2Icon className="size-8 animate-spin text-text-sidebar" />
        </div>
      ) : (
        <ul className="mx-2 px-2 py-2 bg-sidebar flex-1 flex flex-col min-h-0 overflow-y-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {templates.map((pathwayTemplate) => {
            const isSelected = selectedPathwayTemplateIDs.includes(
              pathwayTemplate.id,
            )
            return (
              <li
                key={pathwayTemplate.id}
                className={`relative w-full flex justify-between items-center gap-2 rounded-lg text-white ${isSelected ? 'bg-[#ffffff10]' : ''} hover:bg-[#ffffff20]`}
              >
                <button
                  type="button"
                  onClick={() => togglePathwayTemplate(pathwayTemplate.id)}
                  className="cursor-pointer w-full py-2 px-2"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                      {isSelected ? (
                        <Route
                          className="w-5 h-5"
                          style={{ color: pathwayTemplate.color }}
                        />
                      ) : (
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            backgroundColor: hexToRGBA(
                              pathwayTemplate.color,
                              0.5,
                            ),
                          }}
                        />
                      )}
                    </span>
                    <span className="truncate">{pathwayTemplate.name}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export default PathwayTemplateFilterSection
