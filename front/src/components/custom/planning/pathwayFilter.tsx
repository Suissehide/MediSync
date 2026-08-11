import { Route } from 'lucide-react'

import type { PathwayTemplate } from '../../../types/pathwayTemplate.ts'
import DropdownFilter, {
  type DropdownFilterItem,
} from '../../ui/dropdownFilter.tsx'

export const NO_PATHWAY_KEY = '__no_pathway__'

const NO_PATHWAY_COLOR = '#94a3b8'

type PathwayFilterProps = {
  templates: PathwayTemplate[]
  hiddenIds: Set<string>
  onToggle: (id: string, checked: boolean) => void
  onReset: () => void
}

function PathwayFilter({
  templates,
  hiddenIds,
  onToggle,
  onReset,
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

  return (
    <DropdownFilter
      filters={filters}
      onFilterChange={onToggle}
      triggerLabel={triggerLabel}
      TriggerIcon={Route}
      onReset={hiddenCount > 0 ? onReset : undefined}
    />
  )
}

export default PathwayFilter
