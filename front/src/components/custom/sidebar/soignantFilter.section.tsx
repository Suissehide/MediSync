import { CheckCheck, Stethoscope, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { useSoignantQueries } from '../../../queries/useSoignant.ts'
import { useSoignantStore } from '../../../store/useSoignantStore.ts'
import { selectionPillClass } from './sidebarFilter.styles.ts'

interface SoignantFilterSectionProps {
  /** Titre de la section : texte simple ou sélecteur de mode. */
  title: ReactNode
  /** Bouton d'ajout facultatif, aligné à droite du titre. */
  addAction?: ReactNode
}

function SoignantFilterSection({
  title,
  addAction,
}: SoignantFilterSectionProps) {
  useSoignantQueries()

  const soignants = useSoignantStore((state) => state.soignants)
  const toggleSoignant = useSoignantStore((state) => state.toggleSoignant)
  const selectAllSoignants = useSoignantStore(
    (state) => state.selectAllSoignants,
  )
  const unselectSoignant = useSoignantStore((state) => state.unselectSoignant)
  const selectedSoignantIDs = useSoignantStore(
    (state) => state.selectedSoignantIDs,
  )

  return (
    <>
      <div className="pl-4 pr-2 flex justify-between items-center text-text-sidebar py-2">
        <div className="flex items-center gap-2 min-w-0">
          {title}
          {soignants.length > 0 &&
            (selectedSoignantIDs.length > 0 ? (
              <button
                type="button"
                onClick={() => unselectSoignant()}
                className={selectionPillClass}
              >
                <X className="w-3 h-3" />
                Tout décocher
              </button>
            ) : (
              <button
                type="button"
                onClick={() => selectAllSoignants()}
                className={selectionPillClass}
              >
                <CheckCheck className="w-3 h-3" />
                Tout cocher
              </button>
            ))}
        </div>
        {addAction}
      </div>
      <ul className="mx-2 px-2 py-2 bg-sidebar flex-1 flex flex-col min-h-0 overflow-y-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {soignants.map((soignant) => {
          const isSelected = selectedSoignantIDs.includes(soignant.id)
          return (
            <li
              key={soignant.id}
              className={`w-full flex justify-between items-center gap-2 rounded-lg text-white ${isSelected ? 'bg-[#ffffff10]' : ''} hover:bg-[#ffffff20]`}
            >
              <button
                type="button"
                onClick={() => toggleSoignant(soignant.id)}
                className="cursor-pointer w-full py-2 px-2"
              >
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 shrink-0">
                    {isSelected && <Stethoscope className="w-5 h-5" />}
                  </span>
                  <span className="truncate">{soignant.name}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

export default SoignantFilterSection
