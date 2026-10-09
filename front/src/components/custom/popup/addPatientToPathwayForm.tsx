import { CalendarPlus, Check, Route, X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '../../../libs/utils.ts'
import { usePatientMutations } from '../../../queries/usePatient.tsx'
import type { Patient } from '../../../types/patient.ts'
import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
  PopupTrigger,
} from '../../ui/popup.tsx'
import { PathwaySelector, usePathwaySelector } from '../pathwaySelector.tsx'

interface AddPatientToPathwayFormProps {
  patient: Patient
}

export function AddPatientToPathwayForm({
  patient,
}: AddPatientToPathwayFormProps) {
  const [open, setOpen] = useState(false)
  const pathwayState = usePathwaySelector(patient.id)
  const { enrollExistingPatient } = usePatientMutations()

  const submit = () =>
    enrollExistingPatient.mutate(
      { patientID: patient.id, pathways: pathwayState.plannableEnrollments },
      { onSuccess: () => setOpen(false) },
    )

  const plannable = pathwayState.plannableEnrollments.length
  const blocked = pathwayState.previews?.filter((p) => !p.startDate).length ?? 0
  const plannableLabel = `${plannable} parcours planifiable${plannable > 1 ? 's' : ''}`
  const summary = pathwayState.previews
    ? blocked
      ? `${plannableLabel} · ${blocked} sans date : ${blocked > 1 ? 'ils seront ignorés' : 'il sera ignoré'}`
      : plannableLabel
    : ''

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      pathwayState.reset()
    }
  }

  return (
    <Popup modal open={open} onOpenChange={handleOpenChange}>
      <PopupTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="default"
          className="font-normal leading-tight"
        >
          <CalendarPlus className="w-4 h-4" />
          Inscrire à un parcours
        </Button>
      </PopupTrigger>

      <PopupContent className="w-[860px] max-w-[95vw]">
        <PopupHeader className="py-4">
          <PopupTitle icon={Route} className="font-bold text-xl">
            <span className="flex flex-col">
              Ajouter à un parcours
              <span className="text-sm font-normal text-text-light">
                {patient.firstName} {patient.lastName}
              </span>
            </span>
          </PopupTitle>
        </PopupHeader>

        <PopupBody className="flex flex-col gap-4 py-5">
          <PathwaySelector state={pathwayState} />
        </PopupBody>

        <PopupFooter className="justify-between items-center">
          <span
            className={cn(
              'text-[13px]',
              blocked ? 'text-red-700' : 'text-text-light',
            )}
          >
            {summary}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              <X className="w-4 h-4" />
              Annuler
            </Button>
            <Button
              variant="default"
              onClick={submit}
              disabled={
                !plannable ||
                enrollExistingPatient.isPending ||
                pathwayState.missingMotif
              }
            >
              <Check className="w-4 h-4" />
              {enrollExistingPatient.isPending
                ? 'Inscription...'
                : plannable
                  ? `Inscrire à ${plannable} parcours`
                  : 'Inscrire'}
            </Button>
          </div>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}
