import dayjs, { type Dayjs } from 'dayjs'
import { Check, GitFork, X } from 'lucide-react'
import { useState } from 'react'

import { usePatientMutations } from '../../../queries/usePatient.ts'
import type { Patient, TimeOfDay } from '../../../types/patient.ts'
import {
  PathwaySelector,
  usePathwaySelector,
  type PathwayPeriod,
} from '../pathwaySelector.tsx'
import { Button } from '../../ui/button.tsx'
import { DatePicker } from '../../ui/datePicker.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
  PopupTrigger,
} from '../../ui/popup.tsx'

interface AddPatientToPathwayFormProps {
  patient: Patient
}

export function AddPatientToPathwayForm({
  patient,
}: AddPatientToPathwayFormProps) {
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState<Dayjs>(dayjs())
  const pathwayState = usePathwaySelector()
  const { enrollPatient } = usePatientMutations()

  const periodToTimeOfDay: Record<PathwayPeriod, TimeOfDay> = {
    morning: 'MORNING',
    afternoon: 'AFTERNOON',
    fullday: 'ALL_DAY',
  }

  const handleConfirm = () => {
    if (!pathwayState.addedPathways.length) return
    const { id: _id, ...patientData } = patient
    enrollPatient.mutate(
      {
        patientData,
        startDate: startDate.toISOString(),
        pathways: pathwayState.addedPathways.map((p) => ({
          pathwayTemplateID: p.pathwayTemplateId,
          timeOfDay: periodToTimeOfDay[p.period],
          thematic: p.thematic,
          type: p.type,
        })),
      },
      { onSuccess: () => setOpen(false) },
    )
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setStartDate(dayjs())
      pathwayState.reset()
    }
  }

  return (
    <Popup modal open={open} onOpenChange={handleOpenChange}>
      <PopupTrigger asChild>
        <Button type="button" variant="outline" size="icon">
          <GitFork className="w-4 h-4" />
        </Button>
      </PopupTrigger>

      <PopupContent size="lg">
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Ajouter à un parcours
          </PopupTitle>
        </PopupHeader>

        <PopupBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Date de début</Label>
            <DatePicker
              value={startDate}
              onChange={(d) => {
                if (d) setStartDate(d)
              }}
            />
          </div>

          <em className="text-sm text-neutral-400">
            Ajoutez des parcours et organisez-les par ordre de priorité
          </em>

          <PathwaySelector state={pathwayState} />
        </PopupBody>

        <PopupFooter>
          <Button
            variant="default"
            onClick={handleConfirm}
            disabled={
              !pathwayState.addedPathways.length || enrollPatient.isPending
            }
          >
            <Check className="w-4 h-4" />
            {enrollPatient.isPending ? 'Inscription...' : 'Inscrire'}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}
