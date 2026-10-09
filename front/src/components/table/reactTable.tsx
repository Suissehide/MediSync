import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  type CSSProperties,
  type FC,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

import { cn, safeParse } from '../../libs/utils.ts'
import type { Choice } from './choiceColumn.tsx'
import { ChoiceFilters } from './choiceFilters.tsx'
import { ColumnPicker } from './columnPicker.tsx'
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
  // Nombre de colonnes couvertes par la cellule de cette ligne (les suivantes sont sautées).
  colSpan?: (row: TData) => number
  // Colonne masquée par défaut, que l'utilisateur ajoute depuis « Colonnes ».
  optional?: { label: string; group?: string }
  // Colonne à choix : étiquettes colorées et filtre à cocher dans la barre d'outils.
  choices?: Choice[]
}

// Id DOM d'une ligne, pour la désigner (aria-controls) depuis une autre.
export const rowDomId = (prefix: string, rowId: string) => `${prefix}-${rowId}`

type CustomColumnDef<TData, TValue = unknown> = ColumnDef<TData, TValue> & {
  meta?: CustomMeta<TData, TValue>
}

// Pagination tenue par le serveur : la table n'affiche que la page recue, et le total vient de
// la reponse. L'ecran garde l'etat (page, taille) et le passe a sa requete. Exclusive de
// `pagination` (pagination cote client, sur des donnees deja toutes chargees).
export type ServerPagination = {
  pageIndex: number
  pageSize: number
  rowCount: number
  onChange: (next: { pageIndex: number; pageSize: number }) => void
}

type ReactTableProps<TData extends { id: string }> = {
  columns: CustomColumnDef<TData, any>[]
  data: TData[]
  customButtons?: ReactNode[]
  title?: string
  customHeader?: (rows: Row<TData>[]) => ReactNode
  filterId?: string
  pagination?: boolean
  serverPagination?: ServerPagination
  onRowClick?: (row: TData) => void
  emptyState?: ReactNode
  isRowDisabled?: (row: TData) => boolean
  isRowMuted?: (row: TData) => boolean
  isLoading?: boolean
  autoRowHeight?: boolean
  // Largeurs de colonnes figées sur les `size` au lieu de suivre le contenu :
  // plusieurs tables côte à côte s'alignent alors, et le trop-long est coupé.
  fixedLayout?: boolean
  // Sous-lignes d'une ligne, repliées par défaut.
  getSubRows?: (row: TData) => TData[] | undefined
  // Contrôles de la page, à gauche et à droite de la barre d'outils.
  toolbar?: ReactNode
  toolbarEnd?: ReactNode
  // Chaque changement de valeur vide les filtres de colonnes.
  resetSignal?: number
  onColumnFiltersActiveChange?: (active: boolean) => void
}

export function ReactTable<TData extends { id: string }>({
  columns,
  data,
  title,
  customHeader,
  filterId = 'default',
  pagination = false,
  serverPagination,
  onRowClick,
  emptyState,
  isRowDisabled,
  isRowMuted,
  isLoading,
  autoRowHeight,
  fixedLayout,
  getSubRows,
  toolbar,
  toolbarEnd,
  resetSignal,
  onColumnFiltersActiveChange,
}: ReactTableProps<TData>) {
  const optionalDefaults: VisibilityState = Object.fromEntries(
    columns
      .filter((c) => c.meta?.optional && c.id)
      .map((c) => [c.id as string, false]),
  )
  const storedVisibility = safeParse<VisibilityState>(
    localStorage.getItem(`column-visibility/${filterId}`),
    {},
  )
  // Seules les colonnes optionnelles se masquent : une colonne devenue permanente réapparaît.
  const initialColumnVisibility: VisibilityState = Object.fromEntries(
    Object.keys(optionalDefaults).map((id) => [
      id,
      storedVisibility[id] ?? false,
    ]),
  )
  const initialColumnFilters = safeParse<ColumnFiltersState>(
    localStorage.getItem(`filters/${filterId}`),
    [],
  ).filter((f) => initialColumnVisibility[f.id] !== false)

  const [sorting, setSorting] = useState<SortingState>(
    safeParse(localStorage.getItem(`sorting/${filterId}`), []),
  )
  const [columnFilters, setColumnFilters] =
    useState<ColumnFiltersState>(initialColumnFilters)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialColumnVisibility,
  )
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [expanded, setExpanded] = useState<ExpandedState>({})
  // Préfixe des id de lignes (aria-controls) : unique même si une ligne est dans deux tableaux.
  const rowIdPrefix = useId()
  const [paginationState, setPaginationState] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  })

  const table = useReactTable({
    data: data,
    columns: columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      expanded,
      ...(pagination ? { pagination: paginationState } : {}),
      ...(serverPagination
        ? {
            pagination: {
              pageIndex: serverPagination.pageIndex,
              pageSize: serverPagination.pageSize,
            },
          }
        : {}),
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
    manualPagination: serverPagination !== undefined,
    ...(serverPagination ? { rowCount: serverPagination.rowCount } : {}),
    onPaginationChange: serverPagination
      ? (updater) => {
          const courant = {
            pageIndex: serverPagination.pageIndex,
            pageSize: serverPagination.pageSize,
          }
          serverPagination.onChange(
            typeof updater === 'function' ? updater(courant) : updater,
          )
        }
      : pagination
        ? setPaginationState
        : undefined,
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    getSubRows,
    onExpandedChange: setExpanded,
    meta: { rowIdPrefix },
    getExpandedRowModel: getExpandedRowModel(),
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
    localStorage.setItem(`sorting/${filterId}`, JSON.stringify(sorting))
  }, [sorting, filterId])

  useEffect(() => {
    localStorage.setItem(`filters/${filterId}`, JSON.stringify(columnFilters))
  }, [columnFilters, filterId])

  useEffect(() => {
    localStorage.setItem(
      `column-visibility/${filterId}`,
      JSON.stringify(columnVisibility),
    )
  }, [columnVisibility, filterId])

  useEffect(() => {
    const ids = new Set(table.getAllLeafColumns().map((c) => c.id))
    setColumnFilters((fs) => fs.filter((f) => ids.has(f.id)))
  }, [table])

  const lastResetSignal = useRef(resetSignal)
  useEffect(() => {
    if (resetSignal !== lastResetSignal.current) {
      lastResetSignal.current = resetSignal
      setColumnFilters([])
    }
  }, [resetSignal])

  const onFiltersActiveRef = useRef(onColumnFiltersActiveChange)
  onFiltersActiveRef.current = onColumnFiltersActiveChange
  useEffect(() => {
    onFiltersActiveRef.current?.(columnFilters.length > 0)
  }, [columnFilters])

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

  const hasToolbar =
    toolbar !== undefined ||
    toolbarEnd !== undefined ||
    columns.some((c) => c.meta?.optional)

  const totalRows =
    serverPagination?.rowCount ?? table.getFilteredRowModel().rows.length
  const tableContainerRef = useRef(null)

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {title && <div className="px-4 mb-4 text-2xl font-bold">{title}</div>}

      {hasToolbar && (
        <div
          role="toolbar"
          aria-label="Filtres du tableau"
          className="mb-4 flex flex-wrap items-center gap-3"
        >
          {toolbar}
          <ChoiceFilters table={table} />
          <ColumnPicker table={table} />
          {toolbarEnd && (
            <>
              <div className="flex-1 border-t border-border" />
              {toolbarEnd}
            </>
          )}
        </div>
      )}

      <div className="react-table__filter">
        <div className="above-table__container"></div>

        {customHeader?.(table.getRowModel().rows)}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col rounded-lg border border-border-dark">
        <div
          className="w-full min-h-0 flex-1 overflow-auto rounded-lg"
          ref={tableContainerRef}
        >
          <table
            className={cn(
              'table border-separate border-spacing-0',
              fixedLayout ? 'table-fixed w-full' : 'w-max min-w-full',
            )}
          >
            <HeaderTable
              table={table}
              getCommonPinningStyles={getCommonPinningStyles}
              fixedLayout={fixedLayout}
            />

            <VirtualizedBodyTable
              table={table}
              getCommonPinningStyles={getCommonPinningStyles}
              parentRef={tableContainerRef}
              rowHeight={40}
              autoRowHeight={autoRowHeight}
              fixedLayout={fixedLayout}
              onRowClick={onRowClick}
              emptyState={emptyState}
              isRowDisabled={isRowDisabled}
              isRowMuted={isRowMuted}
              isLoading={isLoading}
            />
          </table>
        </div>
      </div>

      {pagination || serverPagination ? (
        <PaginationTable table={table} totalRows={totalRows} />
      ) : (
        <div className="flex justify-end pt-2">
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
