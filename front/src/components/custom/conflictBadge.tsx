import { TriangleAlert } from 'lucide-react'

import { cn } from '../../libs/utils.ts'

type Props = { labels: string[]; className?: string }

export function ConflictBadge({ labels, className }: Props) {
  if (labels.length === 0) {
    return null
  }
  return (
    <span
      role="img"
      aria-label={`Conflit : ${labels.join(' ; ')}`}
      title={labels.join('\n')}
      className={cn(
        'inline-flex items-center rounded bg-destructive p-0.5 text-white',
        className,
      )}
    >
      <TriangleAlert className="h-2.5 w-2.5" />
    </span>
  )
}
