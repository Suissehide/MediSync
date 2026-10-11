import { Archive } from 'lucide-react'
import type { ReactNode } from 'react'

import { Label } from '@/components/ui/label.tsx'
import { Switch } from '@/components/ui/switch.tsx'

interface SettingsPageHeaderProps {
  title: string
  subtitle: string
  switchId: string
  showDeleted: boolean
  onShowDeletedChange: (checked: boolean) => void
  deletedCount: number
  action?: ReactNode
}

export function SettingsPageHeader({
  title,
  subtitle,
  switchId,
  showDeleted,
  onShowDeletedChange,
  deletedCount,
  action,
}: SettingsPageHeaderProps) {
  return (
    <div className="flex justify-between items-end gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-foreground">{title}</h1>
        <p className="text-sm text-text-light">{subtitle}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id={switchId}
            checked={showDeleted}
            onCheckedChange={onShowDeletedChange}
          />
          <Label htmlFor={switchId}>Supprimés</Label>
          <span
            data-testid="compteur-supprimes"
            className="text-xs px-[7px] rounded-full bg-border text-[#475569] tabular-nums"
          >
            {deletedCount}
            <span className="sr-only"> éléments supprimés</span>
          </span>
        </div>
        {action}
      </div>
    </div>
  )
}

export function DeletedBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-border bg-white text-sm text-text-dark">
      <Archive
        aria-hidden="true"
        className="w-4 h-4 shrink-0 text-text-light"
      />
      {children}
    </div>
  )
}
