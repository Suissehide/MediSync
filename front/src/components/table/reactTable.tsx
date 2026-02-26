import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type Row,
  type RowSelectionState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  type CSSProperties,
  type FC,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

import { safeParse } from '../../libs/utils.ts'
import {
  dateFilterFn,
  dateRangeFilterFn,
  multiSelectFilterFn,
  numberFilterFn,
  numberRangeFilterFn,
  selectFilterFn,
  textFilterFn,
} from './filtersFns'
import { HeaderTable } from './headerTable.js'
import { PaginationTable } from './paginationTable.tsx'
import { VirtualizedBodyTable } from './virtualizedBodyTable'

export type CustomMeta<TData, TValue> = {
  pin?: 'left' | 'right'
  headerClass?: string
  grow?: boolean
  align?: 'left' | 'center' | 'right'
  filter?: FC<{ column: Column<TData, TValue> }>
}

type CustomColumnDef<TData, TValue = unknown> = ColumnDef<TData, TValue> & {
  meta?: CustomMeta<TData, TValue>
}

type ReactTableProps<TData extends { id: string }> = {
  columns: CustomColumnDef<TData, any>[]
  data: TData[]
  customButtons?: ReactNode[]
  title?: string
  customHeader?: (rows: Row<TData>[]) => ReactNode
  filterId?: string
  pagination?: boolean
  onRowClick?: (row: TData) => void
  maxHeight?: string
  emptyState?: ReactNode
  isRowDisabled?: (row: TData) => boolean
}

export function ReactTable<TData extends { id: string }>({
  columns,
  data,
  title,
  customHeader,
  filterId = 'default',
  pagination = false,
  onRowClick,
  maxHeight = '600px',
  emptyState,
  isRowDisabled,
}: ReactTableProps<TData>) {
  const initialColumnFilters = safeParse(
    localStorage.getItem(`filters/${filterId}`),
    [],
  )
  const initialColumnVisibility = safeParse(
    localStorage.getItem(`column-visibility/${filterId}`),
    {},
  )

  const [columnFilters, setColumnFilters] =
    useState<ColumnFiltersState>(initialColumnFilters)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialColumnVisibility,
  )
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [paginationState, setPaginationState] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  })

  const table = useReactTable({
    data: data,
    columns: columns,
    state: {
      columnVisibility,
      rowSelection,
      columnFilters,
      ...(pagination ? { pagination: paginationState } : {}),
    },
    filterFns: {
      text: textFilterFn,
      number: numberFilterFn,
      range: numberRangeFilterFn,
      date: dateFilterFn,
      dateRange: dateRangeFilterFn,
      select: selectFilterFn,
      multiSelect: multiSelectFilterFn,
    },
    defaultColumn: {
      size: 150,
      minSize: 0,
    },
    globalFilterFn: textFilterFn,
    manualPagination: false,
    onPaginationChange: pagination ? setPaginationState : undefined,
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    enableRowSelection: true,
    enableColumnPinning: true,
    autoResetPageIndex: false,
    //
    debugTable: false,
    debugHeaders: false,
    debugColumns: false,
  })

  useEffect(() => {
    localStorage.setItem(`filters/${filterId}`, JSON.stringify(columnFilters))
  }, [columnFilters, filterId])

  useEffect(() => {
    localStorage.setItem(
      `column-visibility/${filterId}`,
      JSON.stringify(columnVisibility),
    )
  }, [columnVisibility, filterId])

  const getCommonPinningStyles = <TData,>(
    column: Column<TData, unknown>,
  ): CSSProperties => {
    const isPinned = column.getIsPinned()

    return {
      left: isPinned === 'left' ? `${column.getStart('left')}px` : undefined,
      right: isPinned === 'right' ? `${column.getAfter('right')}px` : undefined,
      position: isPinned ? 'sticky' : 'relative',
      zIndex: isPinned ? 1 : 0,
      backgroundColor: isPinned ? 'var(--color-card)' : undefined,
      boxShadow:
        isPinned === 'left'
          ? 'inset -1px 0 0 var(--color-border-dark)'
          : isPinned === 'right'
            ? 'inset 1px 0 0 var(--color-border-dark)'
            : undefined,
    }
  }

  useEffect(() => {
    for (const column of table.getAllLeafColumns()) {
      const meta = column.columnDef.meta as CustomMeta<TData, unknown>
      const pin = meta?.pin
      if (pin) {
        column.pin(pin)
      }
    }
  }, [table])

  const totalRows = table.getFilteredRowModel().rows.length
  const tableContainerRef = useRef(null)

  return (
    <div className="flex flex-col">
      {title && <div className="px-4 mb-4 text-2xl font-bold">{title}</div>}

      <div className="react-table__filter">
        <div className="above-table__container"></div>

        {customHeader?.(table.getRowModel().rows)}
      </div>

      <div className="relative rounded-lg border border-border-dark">
        <div className="w-full overflow-auto rounded-lg" style={{ maxHeight }} ref={tableContainerRef}>
          <table className="table w-max min-w-full border-separate border-spacing-0">
            <HeaderTable
              table={table}
              getCommonPinningStyles={getCommonPinningStyles}
            />

            <VirtualizedBodyTable
              table={table}
              getCommonPinningStyles={getCommonPinningStyles}
              parentRef={tableContainerRef}
              rowHeight={40}
              onRowClick={onRowClick}
              emptyState={emptyState}
              isRowDisabled={isRowDisabled}
            />
          </table>
        </div>
      </div>

      {pagination ? (
        <PaginationTable table={table} totalRows={totalRows} />
      ) : (
        <div className="flex justify-end py-2">
          <span className="text-text-light text-xs">
            {totalRows.toLocaleString()}{' '}
            {totalRows > 1 ? 'résultats' : 'résultat'}
          </span>
        </div>
      )}
    </div>
  )
}

export default ReactTable
