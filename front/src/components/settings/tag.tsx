import type { ReactNode } from 'react'

import { cn } from '@/libs/utils.ts'

export function Tag({
  icon,
  variant = 'neutral',
  title,
  children,
}: {
  icon?: ReactNode
  variant?: 'neutral' | 'primary'
  title?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 h-6 px-2 rounded text-[13px]',
        variant === 'primary'
          ? 'bg-primary/10 text-primary-dark'
          : 'bg-muted text-[#475569]',
      )}
    >
      {icon}
      {children}
    </span>
  )
}
