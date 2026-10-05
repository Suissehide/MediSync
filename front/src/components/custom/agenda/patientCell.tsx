import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import type { DayAppointmentRow } from '../../../libs/utils.ts'
import { useConvocationSentMutation } from '../../../queries/useAppointment.ts'
import { useAuthStore } from '../../../store/useAuthStore.ts'
import { Etiquette } from '../../table/etiquette.tsx'
import { Button } from '../../ui/button.tsx'
import { Checkbox } from '../../ui/input.tsx'
import { MAX_VISIBLE_CHIPS } from './chip.ts'

function ConvocationCheckbox({
  appointmentID,
  appointmentPatientID,
  convocationSent,
  patientName,
}: {
  appointmentID: string
  appointmentPatientID: string
  convocationSent: boolean
  patientName: string
}) {
  const { mutate, isPending, variables } = useConvocationSentMutation()
  // Valeur envoyée affichée pendant l'enregistrement, pour que la case réagisse tout de suite.
  const checked = isPending ? !!variables?.convocationSent : convocationSent

  return (
    <Checkbox
      aria-label={`Convocation envoyée à ${patientName}`}
      title="Convocation envoyée"
      checked={checked}
      disabled={isPending}
      onChange={(e) =>
        mutate({
          appointmentID,
          appointmentPatientID,
          convocationSent: e.target.checked,
        })
      }
    />
  )
}

type PatientCellProps = {
  row: DayAppointmentRow
  onAddPatient: (row: DayAppointmentRow) => void
}

export default function PatientCell({ row, onAddPatient }: PatientCellProps) {
  const [expanded, setExpanded] = useState(false)
  // La fiche patient vit sous /e/:establishmentId/s/:serviceId : le contexte
  // vient du store, pose par le layout de service avant que cet ecran (agenda)
  // ne puisse se rendre.
  const context = useAuthStore((state) => state.context)

  const { patients, isIndividual } = row

  const addButton = isIndividual ? null : (
    <Button
      variant="outline"
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
          <div
            key={appointmentPatient.patient.id}
            className="flex shrink-0 items-center gap-1"
          >
            {appointmentPatient.id && (
              <ConvocationCheckbox
                appointmentID={row.id}
                appointmentPatientID={appointmentPatient.id}
                convocationSent={!!appointmentPatient.convocationSent}
                patientName={`${appointmentPatient.patient.firstName} ${appointmentPatient.patient.lastName}`}
              />
            )}
            {context?.serviceId ? (
              <Etiquette asChild className="hover:bg-primary/20">
                <Link
                  to="/e/$establishmentId/s/$serviceId/patient/$patientID"
                  params={{
                    establishmentId: context.establishmentId,
                    serviceId: context.serviceId,
                    patientID: appointmentPatient.patient.id,
                  }}
                >
                  {appointmentPatient.patient.firstName}{' '}
                  {appointmentPatient.patient.lastName}
                </Link>
              </Etiquette>
            ) : (
              <Etiquette>
                {appointmentPatient.patient.firstName}{' '}
                {appointmentPatient.patient.lastName}
              </Etiquette>
            )}
          </div>
        ))}

        {hidden > 0 && (
          // Le bouton de depliage : une etiquette neutre, pour qu'il se lise comme un controle.
          <Etiquette
            asChild
            ton="neutre"
            className="cursor-pointer hover:border-primary/40 hover:text-primary"
          >
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
            >
              {expanded ? 'Voir moins' : `+${hidden}`}
            </button>
          </Etiquette>
        )}
      </div>
      {addButton}
    </div>
  )
}
