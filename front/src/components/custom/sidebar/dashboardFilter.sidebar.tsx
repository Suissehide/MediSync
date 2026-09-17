import { ChevronDown, Route, Stethoscope } from 'lucide-react'
import { useState } from 'react'

import {
  type DashboardFilterMode,
  useDashboardFilterStore,
} from '../../../store/useDashboardFilterStore.ts'
import type { User } from '../../../types/auth.ts'
import {
  PopoverContent,
  PopoverMenuItem,
  PopoverRoot,
  PopoverTrigger,
} from '../../ui/popover.tsx'
import PathwayTemplateFilterSection from './pathwayTemplateFilter.section.tsx'
import SoignantFilterSection from './soignantFilter.section.tsx'

const modeLabels: Record<DashboardFilterMode, string> = {
  soignant: 'Soignants',
  pathway: 'Parcours',
}

interface SidebarDashboardFilterProps {
  user?: User | null
}

function SidebarDashboardFilter({ user }: SidebarDashboardFilterProps) {
  const mode = useDashboardFilterStore((state) => state.mode)
  const setMode = useDashboardFilterStore((state) => state.setMode)
  const [isOpen, setIsOpen] = useState(false)

  const handleSelectMode = (nextMode: DashboardFilterMode) => {
    setMode(nextMode)
    setIsOpen(false)
  }

  const title = (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger className="cursor-pointer shrink-0 flex items-center gap-1 rounded hover:text-white transition-colors">
        <span>{modeLabels[mode]}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start">
        <PopoverMenuItem
          icon={<Stethoscope className="w-4 h-4" />}
          onClick={() => handleSelectMode('soignant')}
        >
          {modeLabels.soignant}
        </PopoverMenuItem>
        <PopoverMenuItem
          icon={<Route className="w-4 h-4" />}
          onClick={() => handleSelectMode('pathway')}
        >
          {modeLabels.pathway}
        </PopoverMenuItem>
      </PopoverContent>
    </PopoverRoot>
  )

  if (mode === 'pathway') {
    return <PathwayTemplateFilterSection title={title} />
  }

  return (
    <SoignantFilterSection isAdmin={user?.role === 'ADMIN'} title={title} />
  )
}

export default SidebarDashboardFilter
