import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'

import { cn } from '../../libs/utils.ts'

type ToggleGroupProps = {
  value?: string
  onValueChange?: (value: string) => void
  className?: string
  children?: React.ReactNode
  disabled?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}

const ToggleGroup = ({
  className,
  value,
  onValueChange,
  children,
  disabled,
  ...aria
}: ToggleGroupProps) => (
  <ToggleGroupPrimitive.Root
    {...aria}
    type="single"
    value={value}
    onValueChange={onValueChange}
    disabled={disabled}
    className={cn(
      'w-fit flex p-0.75 bg-card rounded-[10px] border border-border gap-0.5',
      className,
    )}
  >
    {children}
  </ToggleGroupPrimitive.Root>
)

const ToggleGroupItem = ({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) => (
  <ToggleGroupPrimitive.Item
    className={cn(
      'inline-flex items-center gap-1.5 px-3 h-8 rounded text-sm cursor-pointer transition-colors duration-150',
      'text-text-sidebar hover:bg-background/50 hover:text-gray-500',
      'data-[state=on]:bg-background data-[state=on]:text-text-dark',
      className,
    )}
    {...props}
  />
)

export { ToggleGroup, ToggleGroupItem }
