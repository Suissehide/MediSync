import { BriefcaseMedical } from 'lucide-react'

import {
  useDiagnosticMutations,
  useDiagnosticsByPatientQuery,
} from '../../../../queries/useDiagnosticEducatif.ts'
import { useDiagnosticStore } from '../../../../store/useDiagnosticStore.ts'
import type { Patient } from '../../../../types/patient.ts'
import { DiagnosticForm } from '../../DiagnosticEducatif/diagnostic.form.tsx'

type Props = { patient: Patient }

export default function DiagnosticPatient({ patient }: Props) {
  const { selectedId, setSelectedId } = useDiagnosticStore()

  const { diagnostics } = useDiagnosticsByPatientQuery(patient.id)
  const { updateDiagnostic, deleteDiagnostic } = useDiagnosticMutations(
    patient.id,
  )

  const selected = diagnostics?.find((d) => d.id === selectedId) ?? null

  const handleSave = (updates: Record<string, unknown>) => {
    if (!selectedId) {
      return
    }
    updateDiagnostic.mutate({
      id: selectedId,
      patientId: patient.id,
      ...updates,
    })
  }

  const handleDelete = () => {
    if (!selectedId) {
      return
    }
    deleteDiagnostic.mutate(
      { diagnosticId: selectedId },
      { onSuccess: () => setSelectedId(null) },
    )
  }

  return (
    <div className="flex-1 overflow-y-auto h-full">
      {!selected && (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-text-light">
          <BriefcaseMedical className="h-7 w-7" />
          <p className="text-sm">
            Sélectionnez ou créez un diagnostic dans la barre latérale
          </p>
        </div>
      )}

      {selected && (
        <DiagnosticForm
          diagnostic={selected}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
