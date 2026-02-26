import { type Column, flexRender, type Table } from '@tanstack/react-table'
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react'
import type React from 'react'

import { cn } from '../../libs/utils.ts'
import type { CustomMeta } from './reactTable.tsx'

type HeaderTableProps<TData> = {
  table: Table<TData>
  getCommonPinningStyles: (column: Column<TData>) => React.CSSProperties
}

export function HeaderTable<TData>({
  table,
  getCommonPinningStyles,
}: HeaderTableProps<TData>) {
  return (
    <thead className="sticky top-0 z-10 bg-card">
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map((header) => {
            const { column } = header
            const meta = header.column.columnDef.meta as CustomMeta<
              TData,
              unknown
            >
            const headerClass = meta?.headerClass ?? ''
            const grow = meta?.grow
            const align = meta?.align ?? 'left'
            const filter = meta?.filter
            const sortState = column.getIsSorted()

            let SortIcon = (
              <ChevronsUpDown className="w-3 h-3 text-text-light shrink-0" />
            )
            if (sortState === 'asc') {
              SortIcon = (
                <ChevronUp className="w-3 h-3 text-text-light shrink-0" />
              )
            } else if (sortState === 'desc') {
              SortIcon = (
                <ChevronDown className="w-3 h-3 text-text-light shrink-0" />
              )
            }

            const pinningStyles = getCommonPinningStyles(column)
            // Override sticky bg to match thead background
            const thStyle: React.CSSProperties = {
              ...pinningStyles,
              minWidth: header.getSize(),
              width: grow ? '100%' : undefined,
              ...(pinningStyles.backgroundColor
                ? { backgroundColor: 'var(--color-foreground)' }
                : {}),
            }

            return (
              <th
                key={header.id}
                colSpan={header.colSpan}
                style={thStyle}
                className="h-10 border-b border-border-dark"
              >
                {header.isPlaceholder ? null : (
                  <>
                    <button
                      type="button"
                      onClick={column.getToggleSortingHandler()}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2 text-xs text-text-light font-medium transition-colors',
                        align === 'right' && 'justify-end',
                        align === 'center' && 'justify-center',
                        column.getCanSort() && 'cursor-pointer hover:text-text',
                      )}
                    >
                      <span
                        className={cn('title-column truncate', headerClass)}
                      >
                        {flexRender(
                          column.columnDef.header,
                          header.getContext(),
                        )}
                      </span>
                      {column.getCanSort() && SortIcon}
                    </button>

                    {column.getCanFilter() && filter ? (
                      <div className="default-filter">
                        {flexRender(filter, { column })}
                      </div>
                    ) : null}
                  </>
                )}
              </th>
            )
          })}
        </tr>
      ))}
    </thead>
  )
}
