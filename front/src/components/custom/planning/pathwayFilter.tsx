import { EyeOff, RotateCcw, Route } from 'lucide-react'

import type { PathwayTemplate } from '../../../types/pathwayTemplate.ts'
import DropdownFilter, {
  type DropdownFilterAction,
  type DropdownFilterItem,
} from '../../ui/dropdownFilter.tsx'

export const NO_PATHWAY_KEY = '__no_pathway__'

const NO_PATHWAY_COLOR = '#94a3b8'

type PathwayFilterProps = {
  templates: PathwayTemplate[]
  hiddenIds: Set<string>
  onToggle: (id: string, checked: boolean) => void
  onReset: () => void
  onHideAll: () => void
}

function PathwayFilter({
  templates,
  hiddenIds,
  onToggle,
  onReset,
  onHideAll,
}: PathwayFilterProps) {
  const toItem = (template: PathwayTemplate): DropdownFilterItem => ({
    id: template.id,
    label: template.name,
    checked: !hiddenIds.has(template.id),
    group: template.firstAppointmentOnly ? 'Individuels' : 'Multiples',
    color: template.color,
  })

  const filters: DropdownFilterItem[] = [
    {
      id: NO_PATHWAY_KEY,
      label: 'Hors parcours',
      checked: !hiddenIds.has(NO_PATHWAY_KEY),
      color: NO_PATHWAY_COLOR,
    },
    ...templates.filter((template) => template.firstAppointmentOnly).map(toItem),
    ...templates
      .filter((template) => !template.firstAppointmentOnly)
      .map(toItem),
  ]

  const hiddenCount = hiddenIds.size
  const triggerLabel =
    hiddenCount > 0
      ? `Parcours · ${hiddenCount} masqué${hiddenCount > 1 ? 's' : ''}`
      : 'Parcours'

  // Exactly one of the two actions is offered: reset once something is
  // hidden, hide-all when everything is visible.
  const footerAction: DropdownFilterAction =
    hiddenCount > 0
      ? { label: 'Tout afficher', icon: RotateCcw, onSelect: onReset }
      : { label: 'Tout décocher', icon: EyeOff, onSelect: onHideAll }

  return (
    <DropdownFilter
      filters={filters}
      onFilterChange={onToggle}
      triggerLabel={triggerLabel}
      TriggerIcon={Route}
      footerAction={footerAction}
    />
  )
}

export default PathwayFilter
