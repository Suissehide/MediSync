import {
  type Column,
  flexRender,
  type Row,
  type Table,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type React from 'react'
import { type ReactNode, type RefObject, useEffect } from 'react'

import { cn } from '../../libs/utils.ts'
import type { CustomMeta } from './reactTable.tsx'

type VirtualizedBodyTableProps<TData> = {
  table: Table<TData>
  getCommonPinningStyles: (column: Column<TData>) => React.CSSProperties
  rowHeight: number
  parentRef: RefObject<HTMLElement | null>
  onRowClick?: (row: TData) => void
  emptyState?: ReactNode
  isRowDisabled?: (row: TData) => boolean
}

export function VirtualizedBodyTable<TData>({
  table,
  getCommonPinningStyles,
  rowHeight,
  parentRef,
  onRowClick,
  emptyState,
  isRowDisabled,
}: VirtualizedBodyTableProps<TData>) {
  const rows = table.getRowModel().rows
  const rowCount = rows.length

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0

  useEffect(() => {
    rowVirtualizer.scrollToIndex(0)
    rowVirtualizer.measure()
  }, [rowVirtualizer])

  if (rowCount === 0) {
    return (
      <tbody>
        <tr>
          <td
            colSpan={table.getAllLeafColumns().length}
            className="h-[20em] text-sm text-text-light text-center align-middle"
          >
            {emptyState ?? 'Pas de données'}
          </td>
        </tr>
      </tbody>
    )
  }

  return (
    <tbody className="[&_tr:last-child_td]:border-b-0">
      {paddingTop > 0 && (
        <tr style={{ height: paddingTop }}>
          <td colSpan={table.getAllLeafColumns().length} />
        </tr>
      )}

      {virtualRows.map((virtualRow) => {
        const row: Row<TData> = rows[virtualRow.index]
        const disabled = isRowDisabled?.(row.original)
        const isSelected = row.getIsSelected()

        return (
          <tr
            data-index={virtualRow.index}
            ref={(node) => {
              if (node) {
                rowVirtualizer.measureElement(node)
              }
            }}
            key={row.id}
            style={{ height: rowHeight }}
            data-state={isSelected ? 'selected' : undefined}
            onClick={
              !disabled && onRowClick
                ? () => onRowClick(row.original)
                : undefined
            }
            className={cn(
              'transition-colors data-[state=selected]:bg-primary/10',
              disabled
                ? 'opacity-50 cursor-not-allowed pointer-events-none'
                : onRowClick
                  ? 'cursor-pointer hover:bg-primary/5'
                  : 'hover:bg-primary/5',
            )}
          >
            {row.getVisibleCells().map((cell) => {
              const { column } = cell
              const meta = column.columnDef.meta as CustomMeta<TData, unknown>
              const grow = meta?.grow
              const align = meta?.align ?? 'left'

              return (
                <td
                  key={cell.id}
                  className="px-4 py-2 text-sm border-b border-border"
                  style={{
                    ...getCommonPinningStyles(column),
                    minWidth: column.getSize(),
                    width: grow ? '100%' : undefined,
                    height: rowHeight,
                  }}
                >
                  <div
                    className={cn(
                      'flex items-center gap-2',
                      align === 'right' && 'justify-end',
                      align === 'center' && 'justify-center',
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                </td>
              )
            })}
          </tr>
        )
      })}

      {paddingBottom > 0 && (
        <tr style={{ height: paddingBottom }}>
          <td colSpan={table.getAllLeafColumns().length} />
        </tr>
      )}
    </tbody>
  )
}
