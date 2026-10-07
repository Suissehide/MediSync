import { useStore } from '@tanstack/react-form'
import { Check, X } from 'lucide-react'
import { useMemo } from 'react'

import { useAppForm } from '../../../hooks/formConfig.tsx'
import type { DaySlotRow } from '../../../libs/utils.ts'
import { usePatientQueries } from '../../../queries/usePatient.tsx'
import type { UpdateAppointmentParams } from '../../../types/appointment.ts'
import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'

type AddPatientToAppointmentFormProps = {
  open: boolean
  setOpen: (open: boolean) => void
  row: DaySlotRow
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

  const form = useAppForm({
    defaultValues: {
      patientIDs: row.patients.map(
        (appointmentPatient) => appointmentPatient.patient.id,
      ),
    },
    onSubmit: ({ value }) => {
      if (value.patientIDs.length === 0) {
        onRequestDelete()
        return
      }

      onConfirm({
        id: row.appointmentId ?? '',
        thematicId: row.thematicId,
        type: row.type,
        appointmentPatients: value.patientIDs.map((patientID) => {
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
    },
  })
  const selectedIDs = useStore(form.store, (state) => state.values.patientIDs)

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle>Patients du rendez-vous</PopupTitle>
        </PopupHeader>

        <PopupBody>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await form.handleSubmit()
            }}
            className="flex flex-col gap-2 max-w-md"
          >
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
                Aucun patient sélectionné : valider supprimera le rendez-vous.
              </p>
            )}

            <form.AppField name="patientIDs">
              {(field) => (
                <field.MultiSelect
                  label="Patients"
                  options={patientOptions}
                  maxSelected={row.capacity}
                  placeholder="Sélectionner un ou plusieurs patients"
                />
              )}
            </form.AppField>
          </form>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            onClick={() => form.handleSubmit()}
            isLoading={isPending}
          >
            <Check className="w-4 h-4" />
            {selectedIDs.length === 0 ? 'Supprimer le rendez-vous' : 'Valider'}
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}
