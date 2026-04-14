import { Tooltip } from 'radix-ui'
import React from 'react'

import { cn } from '../../libs/utils.ts'

const TooltipProvider = ({ children, ...props }: React.ComponentPropsWithoutRef<typeof Tooltip.Provider>) => (
  <Tooltip.Provider delayDuration={0} {...props}>{children}</Tooltip.Provider>
)
const TooltipRoot = Tooltip.Root
const TooltipTrigger = Tooltip.Trigger

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof Tooltip.Content>,
  React.ComponentPropsWithoutRef<typeof Tooltip.Content>
>(({ className, sideOffset = 4, children, ...props }, ref) => (
  <Tooltip.Portal>
    <Tooltip.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-[200] max-w-xs rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-text-dark shadow-md',
        'animate-in fade-in-0 zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        'data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2',
        className,
      )}
      {...props}
    >
      {children}
    </Tooltip.Content>
  </Tooltip.Portal>
))
TooltipContent.displayName = Tooltip.Content.displayName

export { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent }
