import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { Eye, Trash2 } from 'lucide-react'

import { MAX_VISIBLE_CHIPS } from '../components/custom/agenda/chip.ts'
import PatientCell from '../components/custom/agenda/patientCell.tsx'
import { Etiquette } from '../components/table/etiquette.tsx'
import { Button } from '../components/ui/button.tsx'
import { APPOINTMENT_TYPE } from '../constants/appointment.constant.ts'
import { styleSoignant } from '../libs/color.ts'
import type { DaySlotRow } from '../libs/utils.ts'

const columnHelper = createColumnHelper<DaySlotRow>()

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
      size: 140,
      cell: ({ row }) => {
        const range = `${dayjs.utc(row.original.startDate).format('HH:mm')} – ${dayjs
          .utc(row.original.endDate)
          .format('HH:mm')}`
        return row.depth > 0 ? (
          <span className="ml-1 border-l-2 border-border-dark pl-3 text-text-light">
            {range}
          </span>
        ) : (
          range
        )
      },
    }),
    columnHelper.accessor('thematic', {
      header: 'Thématique',
      size: 180,
      cell: ({ row, getValue }) =>
        row.original.kind === 'free' ? null : getValue() || '—',
    }),
    // Lieu, soignant et places sont ceux du créneau : pas répétés sur ses sous-lignes.
    columnHelper.accessor('location', {
      header: 'Lieu',
      size: 160,
      cell: ({ row, getValue }) => (row.depth > 0 ? null : getValue() || '—'),
    }),
    columnHelper.display({
      id: 'soignants',
      header: 'Soignant',
      size: 240,
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
      cell: ({ row }) => (
        <PatientCell row={row.original} onAddPatient={onAddPatient} />
      ),
    }),
    columnHelper.accessor('type', {
      header: 'Type',
      size: 140,
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
      cell: ({ row }) =>
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
        ),
    }),
  ]
}
