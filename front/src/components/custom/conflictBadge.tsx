import { TriangleAlert } from 'lucide-react'

import { cn } from '../../libs/utils.ts'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '../ui/tooltip.tsx'

type Props = { labels: string[]; className?: string }

// Bouton plutôt qu'icône : le détail s'ouvre aussi au focus clavier.
export function ConflictBadge({ labels, className }: Props) {
  if (labels.length === 0) {
    return null
  }
  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Conflit : ${labels.join(' ; ')}`}
            className={cn(
              'inline-flex items-center rounded bg-destructive p-0.5 text-white',
              className,
            )}
          >
            <TriangleAlert className="h-2.5 w-2.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="whitespace-pre-line">
          {labels.join('\n')}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}
