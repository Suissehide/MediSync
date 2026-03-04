import { Layers } from 'lucide-react'
import { Popover } from 'radix-ui'

import { cn } from '../../libs/utils.ts'
import { usePathwayTemplateQueries } from '../../queries/usePathwayTemplate.ts'

interface ColorLegendProps {
  title?: string
  className?: string
}

export function ColorLegend({
  title = 'Légende',
  className,
}: ColorLegendProps) {
  const { pathwayTemplates } = usePathwayTemplateQueries()

  if (!pathwayTemplates || !pathwayTemplates.length) {
    return null
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'cursor-pointer flex items-center gap-1.5 rounded-md border border-border bg-card',
            'px-2.5 py-1.5 text-xs font-medium text-text-light',
            'hover:text-text hover:bg-input transition-colors focus:outline-none',
            className,
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          {title}
          <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-input px-1 text-[10px] font-semibold text-text tabular-nums">
            {pathwayTemplates.length}
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="z-50 w-56 rounded-lg border border-border bg-primary-foreground shadow-lg focus:outline-none"
          sideOffset={6}
          align="end"
        >
          <div className="px-3 pt-3 pb-2 border-b border-border">
            <p className="text-sm text-text-light">{title}</p>
          </div>

          <div className="p-2 flex flex-col gap-0.5">
            {pathwayTemplates.map((pathwayTemplate) => (
              <div
                key={pathwayTemplate.id}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-md"
              >
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-black/5"
                  style={{ backgroundColor: pathwayTemplate.color }}
                />
                <span className="text-sm text-text-dark truncate">
                  {pathwayTemplate.name}
                </span>
              </div>
            ))}
          </div>

          <Popover.Arrow className="fill-border" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
