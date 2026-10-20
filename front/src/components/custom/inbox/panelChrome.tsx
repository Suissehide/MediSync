import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import type { InboxService } from '@/queries/useInbox.ts'

export const PANEL_CLASS =
  'w-[490px] max-w-[calc(100vw-16px)] max-h-[min(740px,calc(100vh-80px))] p-0 flex flex-col rounded-xl border border-border bg-white shadow-[0_16px_40px_rgba(4,24,43,.22)]'

export function PanelHeader({
  icon: Icon,
  title,
  count,
  action,
}: {
  icon: LucideIcon
  title: string
  count: number
  action?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 px-[18px] pt-3.5 pb-3 border-b border-border">
      <Icon className="w-[17px] h-[17px]" />
      <h2 className="text-[17px] font-bold text-foreground">{title}</h2>
      {count > 0 && (
        <span className="px-2 rounded-full bg-blue-50 text-primary text-xs font-semibold">
          {count}
        </span>
      )}
      <div className="ml-auto">{action}</div>
    </div>
  )
}

export function ServiceChips({
  services,
  counts,
  value,
  onChange,
}: {
  services: InboxService[]
  counts: Record<string, number>
  value: string
  onChange: (serviceId: string) => void
}) {
  const chip = (id: string, label: string, n?: number) => (
    <button
      key={id}
      type="button"
      aria-pressed={value === id}
      onClick={() => onChange(id)}
      className={`h-[30px] px-3 shrink-0 whitespace-nowrap rounded-full text-[13px] font-medium flex items-center gap-1.5 ${value === id ? 'bg-foreground text-white' : 'border border-border bg-white text-text-dark'}`}
    >
      {label}
      {n ? (
        <span
          className={`px-1.5 rounded-full text-xs ${value === id ? 'bg-white/15' : 'bg-muted'}`}
        >
          {n}
        </span>
      ) : null}
    </button>
  )
  return (
    <div className="flex gap-[5px] overflow-x-auto min-w-0">
      {chip('all', 'Tous')}
      {services.map((s) => chip(s.serviceId, s.name, counts[s.serviceId]))}
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, string][]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="ml-auto shrink-0 flex rounded-lg border border-border p-0.5">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={`h-[26px] px-2.5 rounded-md text-[13px] ${value === k ? 'bg-muted font-semibold' : 'font-medium'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export const FilterBar = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-[5px] px-[18px] py-2.5 border-b border-muted">
    {children}
  </div>
)
