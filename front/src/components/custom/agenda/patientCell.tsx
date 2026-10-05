import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

import type { DayAppointmentRow } from '../../../libs/utils.ts'
import { useConvocationSentMutation } from '../../../queries/useAppointment.ts'
import { useAuthStore } from '../../../store/useAuthStore.ts'
import { Etiquette } from '../../table/etiquette.tsx'
import { Button } from '../../ui/button.tsx'
import { Checkbox } from '../../ui/input.tsx'

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

  return (
    <div className="flex items-start gap-1">
      <div className="flex flex-col items-start gap-1">
        {patients.map((appointmentPatient) => (
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
      </div>
      {addButton}
    </div>
  )
}
