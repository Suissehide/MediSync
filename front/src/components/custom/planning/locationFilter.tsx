import { DoorOpen, EyeOff, RotateCcw } from 'lucide-react'

import type { Location } from '../../../types/location.ts'
import DropdownFilter, {
  type DropdownFilterAction,
  type DropdownFilterItem,
} from '../../ui/dropdownFilter.tsx'

export const NO_LOCATION_KEY = '__no_location__'

type LocationFilterProps = {
  locations: Location[]
  hiddenIds: Set<string>
  onToggle: (id: string, checked: boolean) => void
  onReset: () => void
  onHideAll: () => void
}

function LocationFilter({
  locations,
  hiddenIds,
  onToggle,
  onReset,
  onHideAll,
}: LocationFilterProps) {
  const filters: DropdownFilterItem[] = [
    {
      id: NO_LOCATION_KEY,
      label: 'Sans salle',
      checked: !hiddenIds.has(NO_LOCATION_KEY),
    },
    ...locations.map((location) => ({
      id: location.id,
      label: location.name,
      checked: !hiddenIds.has(location.id),
    })),
  ]

  const hiddenCount = hiddenIds.size
  const triggerLabel =
    hiddenCount > 0
      ? `Salles · ${hiddenCount} masquée${hiddenCount > 1 ? 's' : ''}`
      : 'Salles'

  const headerAction: DropdownFilterAction =
    hiddenCount > 0
      ? { label: 'Tout afficher', icon: RotateCcw, onSelect: onReset }
      : { label: 'Tout décocher', icon: EyeOff, onSelect: onHideAll }

  return (
    <DropdownFilter
      filters={filters}
      onFilterChange={onToggle}
      triggerLabel={triggerLabel}
      TriggerIcon={DoorOpen}
      headerAction={headerAction}
    />
  )
}

export default LocationFilter
