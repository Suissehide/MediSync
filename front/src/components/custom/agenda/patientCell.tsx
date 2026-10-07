import { Link } from '@tanstack/react-router'
import { MessageSquareTextIcon, Plus } from 'lucide-react'
import { useState } from 'react'

import type { DaySlotRow } from '../../../libs/utils.ts'
import { useConvocationSentMutation } from '../../../queries/useAppointment.ts'
import { useAuthStore } from '../../../store/useAuthStore.ts'
import { Etiquette, type TonEtiquette } from '../../table/etiquette.tsx'
import { Button } from '../../ui/button.tsx'
import { Checkbox } from '../../ui/input.tsx'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '../../ui/tooltip.tsx'

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

const MAX_VISIBLE_PATIENTS = 5

const TON_PRESENCE: Record<string, TonEtiquette> = { yes: 'succes', no: 'rose' }

type PatientCellProps = {
  row: DaySlotRow
  onAddPatient: (row: DaySlotRow) => void
}

export default function PatientCell({ row, onAddPatient }: PatientCellProps) {
  const [expanded, setExpanded] = useState(false)
  // La fiche patient vit sous /e/:establishmentId/s/:serviceId : le contexte
  // vient du store, pose par le layout de service avant que cet ecran (agenda)
  // ne puisse se rendre.
  const context = useAuthStore((state) => state.context)

  const { patients } = row

  // Rendez-vous collectif existant : on gère ses patients ; sinon on en crée un.
  const canManage = !!row.appointmentId && !row.isIndividual
  const addButton = (canManage || row.canBook) && (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={canManage ? 'Gérer les patients' : 'Prendre un rendez-vous'}
      className="shrink-0"
      onClick={() => onAddPatient(row)}
    >
      <Plus className="w-3 h-3" />
    </Button>
  )

  // Les patients sont dans les sous-lignes du créneau.
  if (row.subRows) {
    return null
  }

  if (row.kind === 'free') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-light">Libre</span>
        {addButton}
      </div>
    )
  }

  if (patients.length === 0) {
    return addButton || '—'
  }

  const hidden = patients.length - MAX_VISIBLE_PATIENTS
  const visible = expanded ? patients : patients.slice(0, MAX_VISIBLE_PATIENTS)

  return (
    <div className="flex items-start gap-1">
      <div className="flex flex-col items-start gap-1">
        {visible.map((appointmentPatient) => (
          <div
            key={appointmentPatient.patient.id}
            className="flex shrink-0 items-center gap-1"
          >
            {appointmentPatient.id && (
              <ConvocationCheckbox
                appointmentID={appointmentPatient.appointmentId}
                appointmentPatientID={appointmentPatient.id}
                convocationSent={!!appointmentPatient.convocationSent}
                patientName={`${appointmentPatient.patient.firstName} ${appointmentPatient.patient.lastName}`}
              />
            )}
            {context?.serviceId ? (
              <Etiquette
                asChild
                ton={TON_PRESENCE[appointmentPatient.status ?? '']}
                className="hover:brightness-95"
              >
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
              <Etiquette ton={TON_PRESENCE[appointmentPatient.status ?? '']}>
                {appointmentPatient.patient.firstName}{' '}
                {appointmentPatient.patient.lastName}
              </Etiquette>
            )}
            {appointmentPatient.transmissionNotes && (
              <TooltipProvider>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <MessageSquareTextIcon
                      className="h-3.5 w-3.5 shrink-0 text-text-light"
                      aria-label="Notes de transmission"
                    />
                  </TooltipTrigger>
                  <TooltipContent className="whitespace-pre-wrap">
                    {appointmentPatient.transmissionNotes}
                  </TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
            )}
          </div>
        ))}
        {hidden > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1 text-xs text-primary"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Voir moins' : `Voir plus (${hidden})`}
          </Button>
        )}
      </div>
      {addButton}
    </div>
  )
}
