import {
  type Cell,
  type Column,
  flexRender,
  type Row,
  type Table,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type React from 'react'
import { type ReactNode, type RefObject, useEffect } from 'react'

import { cn } from '../../libs/utils.ts'
import { type CustomMeta, rowDomId } from './reactTable.tsx'

type VirtualizedBodyTableProps<TData> = {
  table: Table<TData>
  getCommonPinningStyles: (column: Column<TData>) => React.CSSProperties
  rowHeight: number
  autoRowHeight?: boolean
  parentRef: RefObject<HTMLElement | null>
  onRowClick?: (row: TData) => void
  emptyState?: ReactNode
  isRowDisabled?: (row: TData) => boolean
  isRowMuted?: (row: TData) => boolean
  isLoading?: boolean
}

const getRowClass = ({
  disabled,
  clickable,
  muted,
  tinted,
}: {
  disabled?: boolean
  clickable: boolean
  muted: boolean
  // Sous-ligne, ou ligne dont les sous-lignes sont dépliées.
  tinted: boolean
}) => {
  let interaction = 'hover:bg-primary/5'
  if (disabled) {
    interaction = 'opacity-50 cursor-not-allowed pointer-events-none'
  } else if (clickable) {
    interaction = 'cursor-pointer hover:bg-primary/5'
  }
  return cn(
    'transition-colors data-[state=selected]:bg-primary/10',
    interaction,
    muted && 'bg-gray-100 text-text-light',
    tinted && 'bg-slate-50',
  )
}

// Cellules à rendre, une cellule couvrant `colSpan` colonnes masquant les suivantes.
function spanCells<TData>(row: Row<TData>) {
  const result: { cell: Cell<TData, unknown>; span: number }[] = []
  let skip = 0
  for (const cell of row.getVisibleCells()) {
    if (skip > 0) {
      skip--
      continue
    }
    const meta = cell.column.columnDef.meta as CustomMeta<TData, unknown>
    const span = meta?.colSpan?.(row.original) ?? 1
    skip = span - 1
    result.push({ cell, span })
  }
  return result
}

export function VirtualizedBodyTable<TData>({
  table,
  getCommonPinningStyles,
  rowHeight,
  autoRowHeight = false,
  parentRef,
  onRowClick,
  emptyState,
  isRowDisabled,
  isRowMuted,
  isLoading,
}: VirtualizedBodyTableProps<TData>) {
  const rows = table.getRowModel().rows
  const rowCount = rows.length

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  })

  const { rowIdPrefix } = (table.options.meta ?? {}) as { rowIdPrefix?: string }
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

  if (isLoading) {
    const visibleColumns = table.getVisibleLeafColumns()
    return (
      <tbody>
        {Array.from({ length: 5 }).map((_, rowIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no identity
          <tr key={rowIndex} style={{ height: rowHeight }}>
            {visibleColumns.map((column) => (
              <td
                key={column.id}
                className="px-4 py-2 border-b border-border"
                style={{
                  ...getCommonPinningStyles(column),
                  minWidth: column.getSize(),
                  maxWidth: column.columnDef.maxSize || undefined,
                  height: rowHeight,
                }}
              >
                <div
                  className="h-3.5 rounded bg-muted animate-pulse"
                  style={{
                    width: `${50 + ((rowIndex * 13 + column.getIndex()) % 40)}%`,
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    )
  }

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
        const isChild = row.depth > 0
        const isLastChild = row.getParentRow()?.subRows.at(-1)?.id === row.id

        return (
          <tr
            id={rowIdPrefix && rowDomId(rowIdPrefix, row.id)}
            data-index={virtualRow.index}
            ref={(node) => {
              if (node) {
                rowVirtualizer.measureElement(node)
              }
            }}
            key={row.id}
            style={
              autoRowHeight ? { minHeight: rowHeight } : { height: rowHeight }
            }
            data-state={isSelected ? 'selected' : undefined}
            onClick={
              !disabled && onRowClick
                ? (event) => {
                    // Un contrôle de la ligne (lien, bouton, case) garde son propre effet.
                    if (
                      (event.target as HTMLElement).closest(
                        'a, button, input, label',
                      )
                    ) {
                      return
                    }
                    onRowClick(row.original)
                  }
                : undefined
            }
            className={getRowClass({
              disabled,
              clickable: !!onRowClick,
              muted: !!isRowMuted?.(row.original),
              tinted:
                isChild || (row.getIsExpanded() && row.subRows.length > 0),
            })}
          >
            {spanCells(row).map(({ cell, span }) => {
              const { column } = cell
              const meta = column.columnDef.meta as CustomMeta<TData, unknown>
              const grow = meta?.grow
              const align = meta?.align ?? 'left'

              return (
                <td
                  key={cell.id}
                  colSpan={span}
                  className={cn(
                    'px-4 py-2 text-sm border-b border-border',
                    autoRowHeight && 'align-top',
                    isChild && !isLastChild && 'border-b-[#eef2f6]',
                  )}
                  style={{
                    ...getCommonPinningStyles(column),
                    minWidth: column.getSize(),
                    maxWidth: column.columnDef.maxSize || undefined,
                    width: grow ? '100%' : undefined,
                    ...(autoRowHeight
                      ? { minHeight: rowHeight }
                      : { height: rowHeight }),
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
