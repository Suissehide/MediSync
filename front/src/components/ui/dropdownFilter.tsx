import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Filter, type LucideIcon } from 'lucide-react'
import { Fragment } from 'react'

import { cn } from '../../libs/utils.ts'
import { Button } from './button'

export type DropdownFilterItem = {
  id: string
  label: string
  checked: boolean
  group?: string
  color?: string
}

/** Single action rendered under a separator at the bottom of the menu. */
export type DropdownFilterAction = {
  label: string
  icon?: LucideIcon
  onSelect: () => void
}

const DropdownFilter = ({
  filters,
  onFilterChange,
  triggerLabel = 'Filtres',
  TriggerIcon = Filter,
  footerAction,
}: {
  filters: DropdownFilterItem[]
  onFilterChange: (id: string, checked: boolean) => void
  triggerLabel?: string
  TriggerIcon?: LucideIcon
  footerAction?: DropdownFilterAction
}) => {
  const FooterIcon = footerAction?.icon

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="outline"
          size="default"
          className="font-normal rounded-lg"
        >
          <TriggerIcon size={16} />
          {triggerLabel}
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[220px] max-h-80 overflow-y-auto bg-primary-foreground rounded shadow-md border border-border p-2 z-50"
          align="end"
          sideOffset={5}
          collisionPadding={8}
        >
          {filters.map((filter, index) => {
            const startsGroup =
              Boolean(filter.group) && filter.group !== filters[index - 1]?.group

            return (
              <Fragment key={filter.id}>
                {startsGroup && (
                  <>
                    {index > 0 && (
                      <DropdownMenu.Separator className="my-2 h-px bg-border" />
                    )}
                    <DropdownMenu.Label className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-light select-none">
                      {filter.group}
                    </DropdownMenu.Label>
                  </>
                )}

                <DropdownMenu.CheckboxItem
                  checked={filter.checked}
                  onCheckedChange={(checked) =>
                    onFilterChange(filter.id, checked)
                  }
                  onSelect={(e) => e.preventDefault()}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded cursor-pointer outline-none',
                    'hover:bg-primary/20',
                  )}
                >
                  <div className="w-4 h-4 border border-primary rounded flex items-center justify-center">
                    {filter.checked && (
                      <Check size={12} strokeWidth={3} className="text-primary" />
                    )}
                  </div>
                  {filter.color && (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: filter.color }}
                    />
                  )}
                  <span className="flex-1 text-sm select-none">
                    {filter.label}
                  </span>
                </DropdownMenu.CheckboxItem>
              </Fragment>
            )
          })}

          {footerAction && (
            <>
              <DropdownMenu.Separator className="my-2 h-px bg-border" />
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault()
                  footerAction.onSelect()
                }}
                className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer outline-none hover:bg-primary/20 text-sm select-none"
              >
                {FooterIcon && <FooterIcon size={14} />}
                {footerAction.label}
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export default DropdownFilter
