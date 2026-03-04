import { cn } from '../../libs/utils.ts'

type Props = {
  open?: boolean
  title?: string
  subtitle?: string
  leftSlot?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function FixedBar({
  open = true,
  title,
  subtitle,
  leftSlot,
  children,
  className,
}: Props) {
  if (!open) {
    return null
  }

  return (
    <>
      <div className="h-3" />
      <div
        className={cn(
          'fixed left-[255px] right-0 bottom-0 z-10',
          'flex items-center gap-6 px-6 py-4 h-18',
          'bg-background/65 backdrop-blur-md',
          'border-t border-border',
          'shadow-[0_-4px_30px_rgba(0,0,0,0.07)]',
          className,
        )}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {leftSlot}
          {(title || subtitle) && (
            <div className="flex flex-col gap-0.5 min-w-0">
              {title && (
                <span className="text-sm font-medium text-foreground truncate">
                  {title}
                </span>
              )}
              {subtitle && (
                <span className="text-xs text-muted-foreground truncate">
                  {subtitle}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">{children}</div>
      </div>
    </>
  )
}
