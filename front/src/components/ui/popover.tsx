import { Popover } from 'radix-ui'
import React from 'react'

import { cn } from '../../libs/utils.ts'

const PopoverRoot = Popover.Root
const PopoverTrigger = Popover.Trigger
const PopoverAnchor = Popover.Anchor
const PopoverPortal = Popover.Portal
const PopoverClose = Popover.Close

// ─── Content ─────────────────────────────────────────────────────────────────

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof Popover.Content>,
  React.ComponentPropsWithoutRef<typeof Popover.Content>
>(({ className, sideOffset = 4, children, ...props }, ref) => (
  <PopoverPortal>
    <Popover.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={8}
      className={cn(
        'z-50 min-w-[10rem] overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        'data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2',
        className,
      )}
      {...props}
    >
      {children}
    </Popover.Content>
  </PopoverPortal>
))
PopoverContent.displayName = Popover.Content.displayName

// ─── Menu item ────────────────────────────────────────────────────────────────

type PopoverMenuItemProps = {
  icon?: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
  variant?: 'default' | 'destructive'
  className?: string
}

function PopoverMenuItem({
  icon,
  children,
  onClick,
  variant = 'default',
  className,
}: PopoverMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none transition-colors',
        variant === 'default' &&
          'text-text-dark hover:bg-primary/20 focus-visible:bg-primary/20',
        variant === 'destructive' &&
          'text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10',
        className,
      )}
    >
      {icon && <span className="flex items-center opacity-70">{icon}</span>}
      {children}
    </button>
  )
}

// ─── Separator ────────────────────────────────────────────────────────────────

function PopoverSeparator({ className }: { className?: string }) {
  return <div className={cn('my-1 border-t border-border', className)} />
}

export {
  PopoverRoot,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverClose,
  PopoverMenuItem,
  PopoverSeparator,
}
