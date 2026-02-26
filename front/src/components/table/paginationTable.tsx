import type { Table } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '../ui/button.tsx'
import { Select } from '../ui/select.tsx'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100].map((n) => ({
  value: String(n),
  label: String(n),
}))

const getVisiblePageNumbers = (
  currentPage: number,
  totalPages: number,
  maxVisible = 5,
): number[] => {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const half = Math.floor(maxVisible / 2)
  let start = Math.max(currentPage - half, 1)
  const end = Math.min(start + maxVisible - 1, totalPages)

  if (end - start + 1 < maxVisible) {
    start = Math.max(end - maxVisible + 1, 1)
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

type PaginationTableProps<TData> = {
  table: Table<TData>
  totalRows: number
}

export function PaginationTable<TData>({
  table,
  totalRows,
}: PaginationTableProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination
  const currentPage = pageIndex + 1
  const pageCount = table.getPageCount()
  const visiblePages = getVisiblePageNumbers(currentPage, pageCount)

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="w-3 h-3" />
          </Button>

          {visiblePages[0] > 1 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.setPageIndex(0)}
              >
                1
              </Button>
              {visiblePages[0] > 2 && (
                <span className="px-1 text-text-light text-xs">…</span>
              )}
            </>
          )}

          {visiblePages.map((page) => (
            <Button
              key={page}
              variant={page === currentPage ? 'default' : 'outline'}
              size="sm"
              onClick={() => table.setPageIndex(page - 1)}
            >
              {page}
            </Button>
          ))}

          {visiblePages[visiblePages.length - 1] < pageCount && (
            <>
              {visiblePages[visiblePages.length - 1] < pageCount - 1 && (
                <span className="px-1 text-text-light text-xs">…</span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.setPageIndex(pageCount - 1)}
              >
                {pageCount}
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(val) => {
              table.setPageSize(Number(val))
              table.setPageIndex(0)
            }}
            options={PAGE_SIZE_OPTIONS}
            clearable={false}
          />
        </div>
      </div>

      <div className="text-text-light text-xs">
        {totalRows.toLocaleString()} {totalRows > 1 ? 'résultats' : 'résultat'}
      </div>
    </div>
  )
}
