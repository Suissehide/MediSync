import { Check, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

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
  isPending?: boolean
}

export default function AddPatientToAppointmentForm({
  open,
  setOpen,
  row,
  onConfirm,
  isPending = false,
}: AddPatientToAppointmentFormProps) {
  const { patients } = usePatientQueries()
  const [selectedIDs, setSelectedIDs] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setSelectedIDs([])
      setError('')
    }
  }, [open])

  const remaining = row.capacity - row.patients.length
  const isFull = remaining <= 0

  const patientOptions = useMemo(() => {
    const alreadyIn = new Set(row.patients.map((ap) => ap.patient.id))
    return (patients ?? [])
      .filter((patient) => !alreadyIn.has(patient.id))
      .map((patient) => ({
        value: patient.id,
        label: `${patient.firstName} ${patient.lastName}`,
        sortKey: `${patient.lastName} ${patient.firstName}`,
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr'))
      .map(({ value, label }) => ({ value, label }))
  }, [patients, row.patients])

  const handleConfirm = () => {
    if (selectedIDs.length === 0) {
      setError('Au moins un patient est requis')
      return
    }
    if (isFull) {
      setError('Le rendez-vous est complet')
      return
    }

    onConfirm({
      id: row.id,
      thematicId: row.thematicId,
      type: row.type,
      appointmentPatients: [
        ...row.patients.map((appointmentPatient) => ({
          id: appointmentPatient.id,
          patientID: appointmentPatient.patient.id,
          accompanying: appointmentPatient.accompanying,
          status: appointmentPatient.status,
          rejectionReason: appointmentPatient.rejectionReason,
          transmissionNotes: appointmentPatient.transmissionNotes,
        })),
        ...selectedIDs.map((patientID) => ({ patientID })),
      ],
    })
  }

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle>Ajouter un patient</PopupTitle>
        </PopupHeader>

        <PopupBody>
          <div className="flex flex-col gap-2 max-w-md">
            <p className="text-sm text-text-light">
              {row.patients.length}/{row.capacity} patient
              {row.capacity > 1 ? 's' : ''}
            </p>

            {isFull && (
              <p className="text-xs text-destructive">
                Le rendez-vous est complet
              </p>
            )}

            <FormField>
              <Label htmlFor="add-patient-select">Patients</Label>
              <MultiSelect
                options={patientOptions}
                value={selectedIDs}
                onChange={(value) => {
                  setSelectedIDs(value)
                  setError('')
                }}
                placeholder="Sélectionner un ou plusieurs patients"
                maxSelected={remaining}
                disabled={isFull}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
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
            Ajouter
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
