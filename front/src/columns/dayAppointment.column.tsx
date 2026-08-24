import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { Eye, Trash2 } from 'lucide-react'

import {
  CHIP_CLASS,
  MAX_VISIBLE_CHIPS,
} from '../components/custom/agenda/chip.ts'
import PatientCell from '../components/custom/agenda/patientCell.tsx'
import { Button } from '../components/ui/button.tsx'
import { APPOINTMENT_TYPE } from '../constants/appointment.constant.ts'
import type { DayAppointmentRow } from '../libs/utils.ts'

const columnHelper = createColumnHelper<DayAppointmentRow>()

type DayAppointmentActions = {
  onOpen: (row: DayAppointmentRow) => void
  onDelete: (row: DayAppointmentRow) => void
  onAddPatient: (row: DayAppointmentRow) => void
}

export const getDayAppointmentColumns = ({
  onOpen,
  onDelete,
  onAddPatient,
}: DayAppointmentActions) => {
  return [
    columnHelper.accessor('startDate', {
      id: 'schedule',
      header: 'Horaire',
      size: 140,
      cell: ({ row }) =>
        `${dayjs.utc(row.original.startDate).format('HH:mm')} – ${dayjs
          .utc(row.original.endDate)
          .format('HH:mm')}`,
    }),
    columnHelper.accessor('thematic', {
      header: 'Thématique',
      size: 180,
      cell: ({ getValue }) => getValue() || '—',
    }),
    columnHelper.accessor('location', {
      header: 'Lieu',
      size: 160,
      cell: ({ getValue }) => getValue() || '—',
    }),
    columnHelper.display({
      id: 'soignants',
      header: 'Soignant',
      size: 240,
      cell: ({ row }) => {
        const soignants = row.original.soignants
        if (soignants.length === 0) {
          return '—'
        }
        const visible = soignants.slice(0, MAX_VISIBLE_CHIPS)
        const rest = soignants.length - visible.length
        return (
          <div className="flex items-center gap-1 overflow-hidden">
            {visible.map((soignant) => (
              <span key={soignant.id} className={CHIP_CLASS}>
                {soignant.name}
              </span>
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
      cell: ({ getValue }) => {
        const type = getValue()
        if (!type) {
          return '—'
        }
        return (APPOINTMENT_TYPE as Record<string, string>)[type] ?? type
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      size: 100,
      meta: { align: 'right' },
      cell: ({ row }) => (
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
