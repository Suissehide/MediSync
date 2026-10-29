import type { Column, RowData, Table } from '@tanstack/react-table'
import { Check, Columns3 } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Fragment } from 'react'

import { Button } from '../ui/button.tsx'
import type { Features } from './features.ts'

const optionalOf = <TData extends RowData>(
  column: Column<Features, TData, unknown>,
) => column.columnDef.meta?.optional

// Liste à cocher des colonnes optionnelles ; masquer efface filtre et tri.
export function ColumnPicker<TData extends RowData>({
  table,
}: {
  table: Table<Features, TData>
}) {
  const columns = table.getAllLeafColumns().filter((c) => optionalOf(c))
  if (columns.length === 0) {
    return null
  }

  const toggle = (
    column: Column<Features, TData, unknown>,
    visible: boolean,
  ) => {
    if (!visible) {
      column.setFilterValue(undefined)
      table.setSorting((s) => s.filter((x) => x.id !== column.id))
    }
    column.toggleVisibility(visible)
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" className="font-normal rounded-lg">
          <Columns3 size={16} />
          Colonnes
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[220px] max-h-80 overflow-y-auto bg-primary-foreground rounded shadow-md border border-border p-2 z-50"
          align="end"
          sideOffset={5}
          collisionPadding={8}
        >
          {columns.map((column, index) => {
            const { label, group } = optionalOf(column) ?? { label: column.id }
            const previous = columns[index - 1]
            const startsGroup =
              Boolean(group) &&
              group !== (previous ? optionalOf(previous)?.group : undefined)
            const visible = column.getIsVisible()
            return (
              <Fragment key={column.id}>
                {startsGroup && (
                  <>
                    {index > 0 && (
                      <DropdownMenu.Separator className="my-2 h-px bg-border" />
                    )}
                    <DropdownMenu.Label className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-light select-none">
                      {group}
                    </DropdownMenu.Label>
                  </>
                )}
                <DropdownMenu.CheckboxItem
                  checked={visible}
                  onCheckedChange={(checked) => toggle(column, checked)}
                  onSelect={(e) => e.preventDefault()}
                  className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer outline-none hover:bg-primary/20"
                >
                  <div className="w-4 h-4 border border-primary rounded flex items-center justify-center">
                    {visible && (
                      <Check
                        size={12}
                        strokeWidth={3}
                        className="text-primary"
                      />
                    )}
                  </div>
                  <span className="flex-1 text-sm select-none">{label}</span>
                </DropdownMenu.CheckboxItem>
              </Fragment>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
