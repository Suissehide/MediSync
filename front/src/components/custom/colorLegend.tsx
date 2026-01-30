import { Info } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState } from 'react'

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
  const [open, setOpen] = useState(false)
  const { pathwayTemplates } = usePathwayTemplateQueries()

  if (!pathwayTemplates || !pathwayTemplates.length) {
    return null
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'p-1.5 text-text-light hover:text-primary transition-colors focus:outline-none',
            className,
          )}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <Info className="h-4 w-4" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="z-50 rounded-md border border-border bg-primary-foreground p-3 shadow-lg focus:outline-none"
          sideOffset={0}
          align={'end'}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <p className="text-sm font-semibold text-gray-600 mb-2">{title}</p>
          <div className="flex flex-col gap-1.5">
            {pathwayTemplates.map((pathwayTemplate) => (
              <div key={pathwayTemplate.id} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: pathwayTemplate.color }}
                />
                <span className="text-sm text-text">
                  {pathwayTemplate.name}
                </span>
              </div>
            ))}
          </div>
          <Popover.Arrow className="fill-primary-foreground" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
