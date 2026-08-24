import { Check, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { DayAppointmentRow } from '../../../libs/utils.ts'
import { usePatientQueries } from '../../../queries/usePatient.tsx'
import type { UpdateAppointmentParams } from '../../../types/appointment.ts'
import { Button } from '../../ui/button.tsx'
import { FormField } from '../../ui/formField.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'
import { MultiSelect } from '../../ui/select.tsx'

type AddPatientToAppointmentFormProps = {
  open: boolean
  setOpen: (open: boolean) => void
  row: DayAppointmentRow
  onConfirm: (params: UpdateAppointmentParams) => void
  onRequestDelete: () => void
  isPending?: boolean
}

export default function AddPatientToAppointmentForm({
  open,
  setOpen,
  row,
  onConfirm,
  onRequestDelete,
  isPending = false,
}: AddPatientToAppointmentFormProps) {
  const { patients } = usePatientQueries()
  const [selectedIDs, setSelectedIDs] = useState<string[]>(() =>
    row.patients.map((appointmentPatient) => appointmentPatient.patient.id),
  )

  const patientOptions = useMemo(() => {
    return (patients ?? [])
      .map((patient) => ({
        value: patient.id,
        label: `${patient.firstName} ${patient.lastName}`,
        sortKey: `${patient.lastName} ${patient.firstName}`,
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr'))
      .map(({ value, label }) => ({ value, label }))
  }, [patients])

  const handleConfirm = () => {
    if (selectedIDs.length === 0) {
      onRequestDelete()
      return
    }

    onConfirm({
      id: row.id,
      thematicId: row.thematicId,
      type: row.type,
      appointmentPatients: selectedIDs.map((patientID) => {
        const existing = row.patients.find(
          (appointmentPatient) => appointmentPatient.patient.id === patientID,
        )

        return existing
          ? {
              id: existing.id,
              patientID,
              accompanying: existing.accompanying,
              status: existing.status,
              rejectionReason: existing.rejectionReason,
              transmissionNotes: existing.transmissionNotes,
            }
          : { patientID }
      }),
    })
  }

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle>Patients du rendez-vous</PopupTitle>
        </PopupHeader>

        <PopupBody>
          <div className="flex flex-col gap-2 max-w-md">
            <p className="text-sm text-text-light">
              {selectedIDs.length}/{row.capacity} patient
              {row.capacity > 1 ? 's' : ''}
            </p>

            {selectedIDs.length >= row.capacity && (
              <p className="text-xs text-text-light">
                Capacité atteinte — décochez un patient pour en ajouter un
                autre.
              </p>
            )}

            {selectedIDs.length === 0 && (
              <p className="text-xs text-destructive">
                Aucun patient sélectionné : valider supprimera le
                rendez-vous.
              </p>
            )}

            <FormField>
              <Label>Patients</Label>
              <MultiSelect
                options={patientOptions}
                value={selectedIDs}
                onChange={(next) => {
                  if (
                    next.length <= selectedIDs.length ||
                    next.length <= row.capacity
                  ) {
                    setSelectedIDs(next)
                  }
                }}
                placeholder="Sélectionner un ou plusieurs patients"
              />
            </FormField>
          </div>
        </PopupBody>

        <PopupFooter>
          <Button
            variant="default"
            onClick={handleConfirm}
            isLoading={isPending}
          >
            <Check className="w-4 h-4" />
            {selectedIDs.length === 0 ? 'Supprimer le rendez-vous' : 'Valider'}
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
