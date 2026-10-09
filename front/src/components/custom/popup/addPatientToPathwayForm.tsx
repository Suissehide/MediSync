import { CalendarPlus, Check, X } from 'lucide-react'
import { useState } from 'react'

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
      { patientID: patient.id, pathways: pathwayState.enrollments },
      { onSuccess: () => setOpen(false) },
    )

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

      <PopupContent size="lg">
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Ajouter à un parcours
          </PopupTitle>
        </PopupHeader>

        <PopupBody className="flex flex-col gap-4">
          <em className="text-sm text-neutral-400">
            Ajoutez des parcours et organisez-les par ordre de priorité
          </em>

          <PathwaySelector state={pathwayState} />
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            onClick={submit}
            disabled={
              !pathwayState.addedPathways.length ||
              enrollExistingPatient.isPending ||
              pathwayState.addedPathways.some(
                (p) => p.motifRequired && !p.motif.trim(),
              )
            }
          >
            <Check className="w-4 h-4" />
            {enrollExistingPatient.isPending ? 'Inscription...' : 'Inscrire'}
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}
