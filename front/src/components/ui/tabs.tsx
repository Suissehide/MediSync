import { Tabs as TabsPrimitive } from 'radix-ui'

import { cn } from '../../libs/utils.ts'

const Tabs = TabsPrimitive.Root

const TabsList = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn('flex border-b border-border', className)}
    {...props}
  />
)

const TabsTrigger = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      'relative cursor-pointer px-6 h-10 text-sm text-text-sidebar transition duration-200',
      'hover:text-text-dark',
      'data-[state=active]:text-primary',
      'after:absolute after:-bottom-0.5 after:left-0 after:w-full after:h-0.75',
      'after:transition-all after:duration-200',
      'after:rounded after:bg-transparent data-[state=active]:after:bg-primary',
      className,
    )}
    {...props}
  />
)

const TabsContent = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content
    className={cn('flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto data-[state=inactive]:hidden', className)}
    {...props}
  />
)

export { Tabs, TabsList, TabsTrigger, TabsContent }
