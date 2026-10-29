import {
  createColumnHelper,
  type SortFn,
  sortFn_text,
} from '@tanstack/react-table'
import { Eye, Trash2, User, Users } from 'lucide-react'

import { MAX_VISIBLE_CHIPS } from '../components/custom/agenda/chip.ts'
import PatientCell from '../components/custom/agenda/patientCell.tsx'
import {
  formatRange,
  RangeToggle,
  SlotFrieze,
  SlotTimeline,
} from '../components/custom/agenda/slotRange.tsx'
import { Tronque } from '../components/custom/agenda/tronque.tsx'
import { ConflictBadge } from '../components/custom/conflictBadge.tsx'
import { Etiquette } from '../components/table/etiquette.tsx'
import type { Features } from '../components/table/features.ts'
import { Button } from '../components/ui/button.tsx'
import { APPOINTMENT_TYPE } from '../constants/appointment.constant.ts'
import { styleSoignant } from '../libs/color.ts'
import type { DaySlotRow } from '../libs/utils.ts'

const columnHelper = createColumnHelper<Features, DaySlotRow>()

// Le tri range les plages et les créneaux isolés ; les créneaux d'une plage
// restent dans l'ordre chronologique (à égalité, TanStack garde l'ordre d'origine).
const parentsOnly: SortFn<Features, DaySlotRow> = (a, b, columnId) =>
  a.depth > 0 ? 0 : sortFn_text(a, b, columnId)

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
  conflictLabels: Map<string, string[]>
}

export const getDayAppointmentColumns = ({
  onOpen,
  onDelete,
  onAddPatient,
  soignantIDs,
  conflictLabels,
}: DayAppointmentActions) => {
  return [
    columnHelper.accessor('startDate', {
      id: 'schedule',
      header: 'Horaire',
      size: 150,
      sortFn: parentsOnly,
      cell: ({ row }) => {
        if (row.depth > 0) {
          return <SlotTimeline row={row} />
        }
        // Une plage regroupe plusieurs créneaux : on cumule leurs conflits.
        const slotIds = new Set([
          row.original.slotId,
          ...(row.original.subRows ?? []).map((sub) => sub.slotId),
        ])
        const labels = [...slotIds].flatMap(
          (slotId) => conflictLabels.get(slotId) ?? [],
        )
        return (
          <span className="inline-flex items-center gap-1.5">
            {formatRange(row.original)}
            <ConflictBadge labels={labels} />
          </span>
        )
      },
    }),
    columnHelper.accessor('thematic', {
      header: 'Thématique',
      size: 180,
      sortFn: parentsOnly,
      cell: ({ row, getValue }) => {
        if (row.original.kind === 'free') {
          return null
        }
        if (isRange(row.original)) {
          return (
            <Tronque
              className="text-text-light"
              texte={summarizeThematics(row.original)}
            />
          )
        }
        return <Tronque texte={getValue() || '—'} />
      },
    }),
    // Lieu, soignant et places sont ceux du créneau : pas répétés sur ses sous-lignes.
    columnHelper.accessor('location', {
      header: 'Lieu',
      size: 160,
      sortFn: parentsOnly,
      cell: ({ row, getValue }) =>
        row.depth > 0 ? null : <Tronque texte={getValue() || '—'} />,
    }),
    columnHelper.display({
      id: 'soignants',
      header: 'Soignant',
      size: 220,
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
          <Tronque
            className="flex items-center gap-1"
            texte={soignants.map((s) => s.name).join(', ')}
          >
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
          </Tronque>
        )
      },
    }),
    columnHelper.display({
      id: 'places',
      header: 'Places',
      size: 120,
      cell: ({ row }) => {
        const { subRows, patients, capacity, isIndividual } = row.original
        if (row.depth > 0) {
          return null
        }
        const Icon = isIndividual ? User : Users
        const label = isIndividual ? 'Individuel' : 'Collectif'
        return (
          <span className="flex items-center gap-1.5">
            <Icon
              className="w-3.5 h-3.5 shrink-0 text-muted-foreground"
              aria-label={label}
              role="img"
            >
              <title>{label}</title>
            </Icon>
            {/* Créneau individuel découpé : chaque rendez-vous a sa sous-ligne. */}
            {subRows
              ? `${subRows.filter((r) => r.kind === 'appointment').length} RDV`
              : isIndividual
                ? 'Individuel'
                : `${patients.length}/${capacity}`}
          </span>
        )
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
      sortFn: parentsOnly,
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
