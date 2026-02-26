import { Check, ChevronDown, X } from 'lucide-react'
import { Popover, Select as RadixSelect } from 'radix-ui'
import React, { useState } from 'react'

import { cn } from '../../libs/utils'

// ─── Select ──────────────────────────────────────────────────────────────────

export interface SelectProps extends RadixSelect.SelectProps {
  id?: string
  options: { value: string | number; label: string }[]
  placeholder?: string
  className?: string
  clearable?: boolean
}

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      options,
      placeholder,
      className,
      id,
      value,
      onValueChange,
      clearable = true,
      ...props
    },
    ref,
  ) => {
    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation()
      onValueChange?.('')
    }

    return (
      <div className="relative w-full">
        <RadixSelect.Root
          key={value as string}
          value={value as string}
          onValueChange={onValueChange}
          {...props}
        >
          <RadixSelect.Trigger
            ref={ref}
            id={id}
            className={cn(
              'inline-flex w-full h-9 items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm',
              'focus:outline-none focus:ring-1 focus:ring-ring',
              props.disabled
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer text-text',
              className,
            )}
          >
            <RadixSelect.Value placeholder={placeholder} />
            <RadixSelect.Icon asChild>
              <ChevronDown className="ml-2 h-4 w-4 text-text-light" />
            </RadixSelect.Icon>
          </RadixSelect.Trigger>

          <RadixSelect.Portal>
            <RadixSelect.Content
              id={id}
              position="popper"
              sideOffset={4}
              className="z-50 overflow-hidden rounded-md border border-border bg-popover shadow-md animate-in fade-in-0 slide-in-from-top-2"
            >
              <RadixSelect.Viewport className="p-1">
                {options.map((option) => (
                  <RadixSelect.Item
                    key={option.value}
                    value={option.value.toString()}
                    className="relative flex cursor-pointer select-none items-center rounded px-2 pr-7 py-1.5 text-sm text-text outline-none hover:bg-primary/20 focus:bg-primary/20 data-[state=checked]:text-primary"
                  >
                    <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                    <RadixSelect.ItemIndicator className="absolute right-2">
                      <Check className="h-4 w-4 text-primary" />
                    </RadixSelect.ItemIndicator>
                  </RadixSelect.Item>
                ))}
              </RadixSelect.Viewport>
            </RadixSelect.Content>
          </RadixSelect.Portal>
        </RadixSelect.Root>

        {clearable && value !== '' && value !== undefined && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-9 top-1/2 -translate-y-1/2 text-text-light hover:text-text cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  },
)
Select.displayName = 'Select'

// ─── MultiSelect ─────────────────────────────────────────────────────────────

type MultiSelectOption = { value: string; label: string }

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  maxSelected?: number
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  maxSelected,
}: MultiSelectProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const toggle = (val: string) => {
    const isSelected = value.includes(val)
    if (isSelected) {
      onChange(value.filter((v) => v !== val))
    } else if (!maxSelected || value.length < maxSelected) {
      onChange([...value, val])
    } else if (maxSelected === 1) {
      onChange([val])
    }
  }

  const filteredOptions = options.filter((o) =>
    o.label.toLowerCase().includes(searchTerm.toLowerCase()),
  )
  const selectedOptions = filteredOptions.filter((o) => value.includes(o.value))
  const unselectedOptions = filteredOptions.filter(
    (o) => !value.includes(o.value),
  )

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex w-full h-9 items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-text cursor-pointer"
        >
          <span className="truncate">
            {value.length === 0
              ? placeholder
              : value.length <= 2
                ? options
                    .filter((o) => value.includes(o.value))
                    .map((o) => o.label)
                    .join(', ')
                : `${options
                    .filter((o) => value.slice(0, 2).includes(o.value))
                    .map((o) => o.label)
                    .join(', ')} +${value.length - 2}`}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 text-text-light" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border border-border bg-popover shadow-md"
        >
          <div className="p-2">
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded border border-border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <ul className="p-1 max-h-52 overflow-y-auto">
            {selectedOptions.map((option) => (
              <li
                key={option.value}
                className="relative flex select-none items-center rounded text-sm hover:bg-primary/20"
              >
                <button
                  type="button"
                  onClick={() => toggle(option.value)}
                  className="cursor-pointer flex w-full items-center justify-between rounded px-2 py-1.5"
                >
                  <span>{option.label}</span>
                  <Check className="h-4 w-4 text-primary" />
                </button>
              </li>
            ))}

            {selectedOptions.length > 0 && unselectedOptions.length > 0 && (
              <hr className="my-1 border-t border-border" />
            )}

            {unselectedOptions.map((option) => (
              <li
                key={option.value}
                className="relative flex select-none items-center rounded text-sm hover:bg-primary/20"
              >
                <button
                  type="button"
                  onClick={() => toggle(option.value)}
                  className="cursor-pointer flex w-full items-center justify-between rounded px-2 py-1.5"
                >
                  <span>{option.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
