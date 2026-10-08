import { CheckCheck, DoorOpen, Loader2Icon, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { useLocationQueries } from '../../../queries/useLocation.ts'
import { useDashboardFilterStore } from '../../../store/useDashboardFilterStore.ts'
import { selectionPillClass } from './sidebarFilter.styles.ts'

interface LocationFilterSectionProps {
  /** Titre de la section : texte simple ou sélecteur de mode. */
  title: ReactNode
}

function LocationFilterSection({ title }: LocationFilterSectionProps) {
  const { locations, isPending } = useLocationQueries()
  const toggleLocation = useDashboardFilterStore(
    (state) => state.toggleLocation,
  )
  const selectAllLocations = useDashboardFilterStore(
    (state) => state.selectAllLocations,
  )
  const unselectLocations = useDashboardFilterStore(
    (state) => state.unselectLocations,
  )
  const selectedLocationIDs = useDashboardFilterStore(
    (state) => state.selectedLocationIDs,
  )

  const items = locations ?? []

  return (
    <>
      <div className="pl-4 pr-2 flex justify-between items-center text-text-sidebar py-2">
        <div className="flex items-center gap-2 min-w-0">
          {title}
          {items.length > 0 &&
            (selectedLocationIDs.length > 0 ? (
              <button
                type="button"
                onClick={() => unselectLocations()}
                className={selectionPillClass}
              >
                <X className="w-3 h-3" />
                Tout décocher
              </button>
            ) : (
              <button
                type="button"
                onClick={() => selectAllLocations(items.map((l) => l.id))}
                className={selectionPillClass}
              >
                <CheckCheck className="w-3 h-3" />
                Tout cocher
              </button>
            ))}
        </div>
      </div>

      {isPending ? (
        <div className="mx-2 px-2 py-2 bg-sidebar flex-1 flex justify-center items-center rounded-lg">
          <Loader2Icon className="size-8 animate-spin text-text-sidebar" />
        </div>
      ) : (
        <ul className="mx-2 px-2 py-2 bg-sidebar flex-1 flex flex-col min-h-0 overflow-y-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((location) => {
            const isSelected = selectedLocationIDs.includes(location.id)
            return (
              <li
                key={location.id}
                className={`relative w-full flex justify-between items-center gap-2 rounded-lg text-white ${isSelected ? 'bg-[#ffffff10]' : ''} hover:bg-[#ffffff20]`}
              >
                <button
                  type="button"
                  onClick={() => toggleLocation(location.id)}
                  className="cursor-pointer w-full py-2 px-2"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                      {isSelected ? (
                        <DoorOpen className="w-5 h-5" />
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full bg-white/50" />
                      )}
                    </span>
                    <span className="truncate">{location.name}</span>
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

export default LocationFilterSection
