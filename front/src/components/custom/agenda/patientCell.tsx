import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import type { DayAppointmentRow } from '../../../libs/utils.ts'
import { Button } from '../../ui/button.tsx'
import { CHIP_CLASS, MAX_VISIBLE_CHIPS } from './chip.ts'

type PatientCellProps = {
  row: DayAppointmentRow
  onAddPatient: (row: DayAppointmentRow) => void
}

export default function PatientCell({ row, onAddPatient }: PatientCellProps) {
  const [expanded, setExpanded] = useState(false)

  const { patients, isIndividual } = row

  const addButton = isIndividual ? null : (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Gérer les patients"
      className="shrink-0"
      onClick={() => onAddPatient(row)}
    >
      <Plus className="w-3 h-3" />
    </Button>
  )

  if (patients.length === 0) {
    return (
      <div className="flex items-center gap-1">
        <span>—</span>
        {addButton}
      </div>
    )
  }

  const hidden = patients.length - MAX_VISIBLE_CHIPS
  const visible = expanded ? patients : patients.slice(0, MAX_VISIBLE_CHIPS)

  return (
    <div className="flex items-center gap-1">
      <div
        // The table uses `table w-max min-w-full` (auto layout at max-content
        // width), so a flex-wrap container's max-content contribution is the
        // sum of all items on one line — wrapping alone won't shrink it.
        // An explicit max-width forces the wrap. 216px comes from the
        // `patients` column's declared size (280, see
        // dayAppointment.column.tsx) minus the <td> horizontal padding
        // (px-4 = 32px) minus the manage "+" button and its gap (~28px):
        // 280 − 32 − 28 ≈ 216.
        className={
          expanded
            ? 'flex flex-wrap items-center gap-1 max-w-[216px]'
            : 'flex items-center gap-1 overflow-hidden'
        }
      >
        {visible.map((appointmentPatient) => (
          <Link
            key={appointmentPatient.patient.id}
            to="/patient/$patientID"
            params={{ patientID: appointmentPatient.patient.id }}
            className={`${CHIP_CLASS} hover:bg-primary/20`}
          >
            {appointmentPatient.patient.firstName}{' '}
            {appointmentPatient.patient.lastName}
          </Link>
        ))}

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? 'Réduire la liste des patients'
                : hidden > 1
                  ? `Afficher les ${hidden} patients masqués`
                  : 'Afficher le patient masqué'
            }
            className="shrink-0 text-xs text-muted-foreground font-medium cursor-pointer hover:text-primary transition-colors"
          >
            {expanded ? 'Voir moins' : `+${hidden}`}
          </button>
        )}
      </div>
      {addButton}
    </div>
  )
}
