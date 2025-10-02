import type React from 'react'
import { flexRender, type Table, type Header } from '@tanstack/react-table'
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react'
import type { CustomMeta } from './reactTable.tsx'

type HeaderTableProps<TData, TValue> = {
  table: Table<TData>
  getCommonPinningStyles: (
    column: Header<TData, TValue>['column'],
  ) => React.CSSProperties
}

export function HeaderTable<TData, TValue>({
  table,
  getCommonPinningStyles,
}: HeaderTableProps<TData, TValue>) {
  return (
    <thead className="sticky top-0 z-10 bg-card">
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id} className="p-4">
          {headerGroup.headers.map((header) => {
            const { column } = header
            const meta = header.column.columnDef.meta as CustomMeta<
              TData,
              TValue
            >
            const headerClass = meta?.headerClass ?? ''
            const grow = meta?.grow
            const filter = meta?.filter
            const sortState = column.getIsSorted()
            let SortIcon = (
              <ChevronsUpDown className="w-4 h-4 text-text-light" />
            )
            if (sortState === 'asc') {
              SortIcon = <ChevronUp className="w-4 h-4 text-text-light" />
            } else if (sortState === 'desc') {
              SortIcon = <ChevronDown className="w-4 h-4 text-text-light" />
            }

            return (
              <th
                key={header.id}
                colSpan={header.colSpan}
                style={{
                  ...getCommonPinningStyles(column),
                  width: grow ? 'auto' : header.getSize(),
                  minWidth: header.getSize(),
                }}
                className="border border-border"
              >
                {header.isPlaceholder ? null : (
                  <>
                    <button
                      type="button"
                      onClick={column.getToggleSortingHandler()}
                      className={`w-full flex items-center gap-4 px-4 py-2 text-sm text-text-light font-normal ${column.getCanSort() ? 'cursor-pointer' : ''}`}
                    >
                      <div className={`title-column ${headerClass}`}>
                        {flexRender(
                          column.columnDef.header,
                          header.getContext(),
                        )}
                      </div>

                      {column.getCanSort() && <div>{SortIcon}</div>}
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
