import {
  createColumnHelper,
  type SortingFn,
  sortingFns,
} from '@tanstack/react-table'
import { Eye, Trash2 } from 'lucide-react'

import { MAX_VISIBLE_CHIPS } from '../components/custom/agenda/chip.ts'
import PatientCell from '../components/custom/agenda/patientCell.tsx'
import {
  formatRange,
  RangeToggle,
  SlotFrieze,
  SlotTimeline,
} from '../components/custom/agenda/slotRange.tsx'
import { Etiquette } from '../components/table/etiquette.tsx'
import { Button } from '../components/ui/button.tsx'
import { APPOINTMENT_TYPE } from '../constants/appointment.constant.ts'
import { styleSoignant } from '../libs/color.ts'
import type { DaySlotRow } from '../libs/utils.ts'

const columnHelper = createColumnHelper<DaySlotRow>()

// Le tri range les plages et les créneaux isolés ; les créneaux d'une plage
// restent dans l'ordre chronologique (à égalité, TanStack garde l'ordre d'origine).
const parentsOnly: SortingFn<DaySlotRow> = (a, b, columnId) =>
  a.depth > 0 ? 0 : sortingFns.text(a, b, columnId)

// Une plage repliée : sa frise occupe les colonnes Patients et Type.
const isRange = (row: DaySlotRow) => !!row.subRows

const summarizeThematics = (row: DaySlotRow) => {
  const thematics = [
    ...new Set(
      (row.subRows ?? [])
        .filter((sub) => sub.kind === 'appointment' && sub.thematic)
        .map((sub) => sub.thematic),
    ),
  ]
  return thematics.length > 1
    ? `${thematics.length} thématiques`
    : (thematics[0] ?? row.thematic)
}

type DayAppointmentActions = {
  onOpen: (row: DaySlotRow) => void
  onDelete: (row: DaySlotRow) => void
  onAddPatient: (row: DaySlotRow) => void
  soignantIDs: string[]
}

export const getDayAppointmentColumns = ({
  onOpen,
  onDelete,
  onAddPatient,
  soignantIDs,
}: DayAppointmentActions) => {
  return [
    columnHelper.accessor('startDate', {
      id: 'schedule',
      header: 'Horaire',
      size: 180,
      sortingFn: parentsOnly,
      cell: ({ row }) => {
        if (row.depth > 0) {
          return <SlotTimeline row={row} />
        }
        return formatRange(row.original)
      },
    }),
    columnHelper.accessor('thematic', {
      header: 'Thématique',
      size: 180,
      sortingFn: parentsOnly,
      cell: ({ row, getValue }) => {
        if (row.original.kind === 'free') {
          return null
        }
        if (isRange(row.original)) {
          return (
            <span className="text-text-light">
              {summarizeThematics(row.original)}
            </span>
          )
        }
        return getValue() || '—'
      },
    }),
    // Lieu, soignant et places sont ceux du créneau : pas répétés sur ses sous-lignes.
    columnHelper.accessor('location', {
      header: 'Lieu',
      size: 160,
      sortingFn: parentsOnly,
      cell: ({ row, getValue }) => (row.depth > 0 ? null : getValue() || '—'),
    }),
    columnHelper.display({
      id: 'soignants',
      header: 'Soignant',
      size: 200,
      cell: ({ row }) => {
        const soignants = row.original.soignants
        if (row.depth > 0) {
          return null
        }
        if (soignants.length === 0) {
          return '—'
        }
        const visible = soignants.slice(0, MAX_VISIBLE_CHIPS)
        const rest = soignants.length - visible.length
        return (
          <div className="flex items-center gap-1 overflow-hidden">
            {visible.map((soignant) => (
              <Etiquette
                key={soignant.id}
                style={styleSoignant(soignant.id, soignantIDs)}
              >
                {soignant.name}
              </Etiquette>
            ))}
            {rest > 0 && (
              <span className="shrink-0 text-xs text-muted-foreground font-medium">
                +{rest}
              </span>
            )}
          </div>
        )
      },
    }),
    columnHelper.display({
      id: 'places',
      header: 'Places',
      size: 90,
      cell: ({ row }) => {
        const { subRows, patients, capacity } = row.original
        if (row.depth > 0) {
          return null
        }
        // Créneau individuel découpé : chaque rendez-vous a sa sous-ligne.
        if (subRows) {
          return `${subRows.filter((r) => r.kind === 'appointment').length} RDV`
        }
        return `${patients.length}/${capacity}`
      },
    }),
    columnHelper.display({
      id: 'patients',
      header: 'Patients',
      size: 280,
      meta: { colSpan: (row: DaySlotRow) => (isRange(row) ? 2 : 1) },
      cell: ({ row }) =>
        isRange(row.original) ? (
          <SlotFrieze row={row} onAddPatient={onAddPatient} />
        ) : (
          <PatientCell row={row.original} onAddPatient={onAddPatient} />
        ),
    }),
    columnHelper.accessor('type', {
      header: 'Type',
      size: 140,
      sortingFn: parentsOnly,
      cell: ({ row, getValue }) => {
        const type = getValue()
        if (!type) {
          return row.original.kind === 'free' || row.original.subRows
            ? null
            : '—'
        }
        return (APPOINTMENT_TYPE as Record<string, string>)[type] ?? type
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      size: 100,
      meta: { align: 'right' },
      cell: ({ row, table }) => {
        if (isRange(row.original)) {
          const { rowIdPrefix } = table.options.meta as { rowIdPrefix: string }
          return <RangeToggle row={row} idPrefix={rowIdPrefix} />
        }
        return (
          row.original.appointmentId && (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Ouvrir le rendez-vous"
                onClick={() => onOpen(row.original)}
              >
                <Eye className="w-3 h-3" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Supprimer le rendez-vous"
                onClick={() => onDelete(row.original)}
              >
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          )
        )
      },
    }),
  ]
}
