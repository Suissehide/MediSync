import { DateCalendar } from '@mui/x-date-pickers'
import { createFileRoute } from '@tanstack/react-router'
import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import dayjs, { type Dayjs } from 'dayjs'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'

import DashboardLayout from '../../components/dashboard.layout.tsx'
import { HeaderTable } from '../../components/table/headerTable.tsx'
import type { CustomMeta } from '../../components/table/reactTable.tsx'
import { Button } from '../../components/ui/button.tsx'
import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from '../../components/ui/popover.tsx'
import { hexToRgba } from '../../libs/utils.ts'
import { usePathwayTrackingQuery } from '../../queries/usePathway.ts'

export const Route = createFileRoute('/_authenticated/suivi')({
  component: SuiviPage,
})

type SuiviRow = {
  id: string
  type: 'group' | 'patient'
  pathwayColor: string
  pathwayName: string
  firstName: string
  lastName: string
  days: Map<number, { status: string | null }>
}

function getCommonPinningStyles(
  column: Column<SuiviRow, unknown>,
): CSSProperties {
  const isPinned = column.getIsPinned()
  return {
    left: isPinned === 'left' ? `${column.getStart('left')}px` : undefined,
    right: isPinned === 'right' ? `${column.getAfter('right')}px` : undefined,
    position: isPinned ? 'sticky' : 'relative',
    zIndex: isPinned ? 1 : 0,
    backgroundColor: isPinned ? 'var(--color-background)' : undefined,
    boxShadow:
      isPinned === 'left'
        ? 'inset -1px 0 0 var(--color-border)'
        : isPinned === 'right'
          ? 'inset 1px 0 0 var(--color-border)'
          : undefined,
  }
}

function SuiviPage() {
  const [date, setDate] = useState<Dayjs>(dayjs())
  const containerRef = useRef<HTMLDivElement>(null)

  const { trackingPathways, isPending } = usePathwayTrackingQuery(
    date.year(),
    date.month() + 1,
  )

  const daysInMonth = date.daysInMonth()
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth],
  )

  const today =
    dayjs().year() === date.year() && dayjs().month() === date.month()
      ? dayjs().date()
      : null

  const rows = useMemo<SuiviRow[]>(() => {
    if (!trackingPathways) {
      return []
    }
    return trackingPathways.flatMap((pathway) => {
      const color = pathway.template?.color ?? '#6366f1'
      const name = pathway.template?.name ?? 'Parcours sans modèle'

      const groupRow: SuiviRow = {
        id: pathway.id,
        type: 'group',
        pathwayColor: color,
        pathwayName: name,
        firstName: '',
        lastName: '',
        days: new Map(),
      }

      const patientRows: SuiviRow[] = pathway.patients.map((patient) => ({
        id: `${pathway.id}-${patient.id}`,
        type: 'patient',
        pathwayColor: color,
        pathwayName: name,
        firstName: patient.firstName,
        lastName: patient.lastName,
        days: new Map(
          patient.appointments.map((apt) => [
            dayjs(apt.date).date(),
            { status: apt.status },
          ]),
        ),
      }))

      return [groupRow, ...patientRows]
    })
  }, [trackingPathways])

  const columns = useMemo<ColumnDef<SuiviRow, unknown>[]>(
    () => [
      {
        id: 'patient',
        header: 'Patient',
        size: 180,
        enableSorting: false,
        meta: {
          pin: 'left',
        } satisfies CustomMeta<SuiviRow, unknown>,
        cell: ({ row }) =>
          row.original.type === 'patient'
            ? `${row.original.firstName} ${row.original.lastName}`
            : null,
      },
      ...days.map((d) => ({
        id: `day-${d}`,
        header: String(d),
        size: 32,
        enableSorting: false,
        meta: {
          align: 'center',
        } satisfies CustomMeta<SuiviRow, unknown>,
        cell: ({ row }: { row: { original: SuiviRow } }) => {
          if (row.original.type === 'group') {
            return null
          }
          const apt = row.original.days.get(d)
          if (!apt) {
            return null
          }
          return apt.status != null ? (
            <X className="w-3 h-3 mx-auto text-red-500" />
          ) : (
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: row.original.pathwayColor }}
            />
          )
        },
      })),
    ],
    [days],
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    defaultColumn: { size: 32, minSize: 0 },
    enableColumnPinning: true,
  })

  useEffect(() => {
    for (const column of table.getAllLeafColumns()) {
      const meta = column.columnDef.meta as CustomMeta<SuiviRow, unknown>
      if (meta?.pin) {
        column.pin(meta.pin)
      }
    }
  }, [table])

  const prevMonth = () => setDate((d) => d.subtract(1, 'month'))
  const nextMonth = () => setDate((d) => d.add(1, 'month'))

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background rounded-lg flex flex-col w-full gap-4">
        <div className="pl-6 mt-4 mb-6 flex justify-between items-center gap-4">
          <h1 className="text-2xl font-bold">Suivi</h1>

          <div className="flex items-center gap-1">
            <Button variant="none" size="icon" onClick={prevMonth}>
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <span className="min-w-36 text-center font-medium capitalize">
              {date.format('MMMM YYYY')}
            </span>

            <PopoverRoot>
              <PopoverTrigger asChild>
                <Button type="button" variant="none" size="icon">
                  <CalendarDays className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="center" className="p-0 w-auto">
                <DateCalendar
                  views={['year', 'month']}
                  openTo="month"
                  value={date}
                  onChange={(newDate) => {
                    if (newDate) {
                      setDate(newDate)
                    }
                  }}
                />
              </PopoverContent>
            </PopoverRoot>

            <Button variant="none" size="icon" onClick={nextMonth}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="px-6">
          {isPending ? (
            <div className="text-center text-text-light text-sm px-6">
              Chargement...
            </div>
          ) : !trackingPathways || trackingPathways.length === 0 ? (
            <div className="text-center text-text-light text-sm">
              Aucun parcours ce mois-ci.
            </div>
          ) : (
            <div
              ref={containerRef}
              className="overflow-x-auto rounded-md border border-border"
            >
              <table className="w-max min-w-full border-separate border-spacing-0">
                <HeaderTable
                  table={table}
                  getCommonPinningStyles={getCommonPinningStyles}
                />

                <tbody>
                  {table.getRowModel().rows.map((row) => {
                    if (row.original.type === 'group') {
                      return (
                        <tr key={row.id}>
                          <td
                            colSpan={days.length + 1}
                            className="px-3 py-1.5 text-sm font-semibold border-b border-border"
                            style={{
                              backgroundColor: hexToRgba(
                                row.original.pathwayColor,
                                0.12,
                              ),
                            }}
                          >
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                              style={{
                                backgroundColor: row.original.pathwayColor,
                              }}
                            />
                            {row.original.pathwayName}
                          </td>
                        </tr>
                      )
                    }

                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border hover:bg-primary/5 transition-colors"
                      >
                        {row.getVisibleCells().map((cell) => {
                          const isPinned = cell.column.getIsPinned()
                          const dayNum = cell.column.id.startsWith('day-')
                            ? parseInt(cell.column.id.slice(4), 10)
                            : null
                          const apt =
                            dayNum != null
                              ? row.original.days.get(dayNum)
                              : null
                          const isToday = dayNum === today

                          return (
                            <td
                              key={cell.id}
                              className="border-b border-border"
                              style={{
                                ...getCommonPinningStyles(cell.column),
                                minWidth: cell.column.getSize(),
                                width: isPinned
                                  ? undefined
                                  : cell.column.getSize(),
                                height: 40,
                                ...(apt
                                  ? {
                                      backgroundColor: hexToRgba(
                                        row.original.pathwayColor,
                                        0.3,
                                      ),
                                    }
                                  : isToday
                                    ? { backgroundColor: 'var(--color-input)' }
                                    : {}),
                              }}
                            >
                              <div
                                className={
                                  isPinned
                                    ? 'px-3 text-sm text-text whitespace-nowrap'
                                    : 'flex items-center justify-center h-full'
                                }
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
