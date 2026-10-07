import type { Row } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { ChevronDown } from 'lucide-react'

import { cn, type DaySlotRow } from '../../../libs/utils.ts'
import { rowDomId } from '../../table/reactTable.tsx'
import { Button } from '../../ui/button.tsx'

export const formatRange = (row: DaySlotRow) =>
  `${dayjs.utc(row.startDate).format('HH:mm')} – ${dayjs.utc(row.endDate).format('HH:mm')}`

const formatDuration = (row: DaySlotRow) => {
  const minutes = dayjs
    .utc(row.endDate)
    .diff(dayjs.utc(row.startDate), 'minute')
  if (minutes < 60) {
    return `${minutes} min`
  }
  const rest = minutes % 60
  return `${Math.floor(minutes / 60)} h${rest ? String(rest).padStart(2, '0') : ''}`
}

const describe = (row: DaySlotRow) => {
  const patient = row.patients[0]?.patient
  return `${formatRange(row)} · ${patient ? `${patient.firstName} ${patient.lastName}` : 'Libre'}`
}

// Fin de ligne d'une plage découpée : replie ou déplie ses créneaux.
export function RangeToggle({
  row,
  idPrefix,
}: {
  row: Row<DaySlotRow>
  idPrefix: string
}) {
  const open = row.getIsExpanded()
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={row.getToggleExpandedHandler()}
      aria-expanded={open}
      aria-controls={row.subRows
        .map((sub) => rowDomId(idPrefix, sub.id))
        .join(' ')}
      aria-label={open ? 'Masquer les créneaux' : 'Afficher les créneaux'}
    >
      <ChevronDown
        className={cn(
          'size-4 transition-transform duration-150',
          open && 'rotate-180',
        )}
      />
    </Button>
  )
}

// Horaire d'un créneau sous sa plage : point sur une ligne de temps, puis la durée.
export function SlotTimeline({ row }: { row: Row<DaySlotRow> }) {
  const isLast = row.getParentRow()?.subRows.at(-1)?.id === row.id
  const isFree = row.original.kind === 'free'
  return (
    <>
      <span
        className={cn(
          'absolute left-[31px] top-0 border-l-2 border-border-dark',
          isLast ? 'bottom-1/2' : 'bottom-0',
        )}
      />
      <span
        className={cn(
          'absolute left-[26px] top-1/2 -mt-1.5 size-3 rounded-full border-2',
          isFree ? 'border-slate-400 bg-white' : 'border-primary bg-primary',
        )}
      />
      <span className="flex flex-col gap-px pl-[44px] text-slate-600">
        <span>{formatRange(row.original)}</span>
        <span className="text-xs text-text-light">
          {formatDuration(row.original)}
        </span>
      </span>
    </>
  )
}

// Plage repliée : un segment par créneau, en largeur proportionnelle à sa durée.
export function SlotFrieze({
  row,
  onAddPatient,
}: {
  row: Row<DaySlotRow>
  onAddPatient: (row: DaySlotRow) => void
}) {
  return (
    <div className="flex h-[26px] w-full gap-[3px] pr-4">
      {row.subRows.map(({ original: slot }) => {
        const isFree = slot.kind === 'free'
        const minutes = dayjs
          .utc(slot.endDate)
          .diff(dayjs.utc(slot.startDate), 'minute')
        return (
          <button
            key={slot.id}
            type="button"
            title={describe(slot)}
            aria-label={describe(slot)}
            onClick={() => {
              if (!isFree) {
                row.toggleExpanded(true)
              } else if (slot.canBook) {
                onAddPatient(slot)
              }
            }}
            style={{
              flex: minutes,
              ...(isFree && {
                background:
                  'repeating-linear-gradient(135deg, #f8fafc 0 4px, #e2e8f0 4px 5px)',
              }),
            }}
            className={cn(
              'flex min-w-0 cursor-pointer items-center overflow-hidden whitespace-nowrap rounded border px-1.5 text-[11px] font-semibold text-blue-800',
              isFree ? 'border-border-dark' : 'border-blue-300 bg-blue-100',
            )}
          >
            <span className="truncate">
              {slot.patients[0]?.patient.firstName}
            </span>
          </button>
        )
      })}
    </div>
  )
}
