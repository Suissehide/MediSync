import { BriefcaseMedical } from 'lucide-react'
import { useState } from 'react'
import { DiagnosticForm } from '../../DiagnosticEducatif/diagnostic.form.tsx'
import { DiagnosticSidebar } from '../../DiagnosticEducatif/diagnostic.sidebar.tsx'
import { DiagnosticView } from '../../DiagnosticEducatif/diagnostic.view.tsx'
import {
  useDiagnosticMutations,
  useDiagnosticsByPatientQuery,
} from '../../../../queries/useDiagnosticEducatif.ts'
import type { Patient } from '../../../../types/patient.ts'

type Props = { patient: Patient }

export default function DiagnosticPatient({ patient }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)

  const { diagnostics } = useDiagnosticsByPatientQuery(patient.id)
  const { createDiagnostic, updateDiagnostic } = useDiagnosticMutations(patient.id)

  const selected = diagnostics?.find((d) => d.id === selectedId) ?? null

  const handleNew = () => {
    createDiagnostic.mutate(
      { patientId: patient.id, activeFields: [] },
      { onSuccess: (created) => { setSelectedId(created.id); setEditMode(true) } }
    )
  }

  const handleSave = (updates: Record<string, unknown>) => {
    if (!selectedId) return
    updateDiagnostic.mutate(
      { id: selectedId, patientId: patient.id, ...updates },
      { onSuccess: () => setEditMode(false) }
    )
  }

  return (
    <div className="flex gap-4 h-full">
      <div className="border-r border-border pr-4">
        <DiagnosticSidebar
          diagnostics={diagnostics ?? []}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setEditMode(false) }}
          onNew={handleNew}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selected && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-text-light">
            <BriefcaseMedical className="h-10 w-10" />
            <p className="text-sm">Sélectionnez ou créez un diagnostic</p>
          </div>
        )}
        {selected && !editMode && (
          <DiagnosticView diagnostic={selected} onEdit={() => setEditMode(true)} />
        )}
        {selected && editMode && (
          <DiagnosticForm
            diagnostic={selected}
            onSave={handleSave}
            onCancel={() => setEditMode(false)}
          />
        )}
      </div>
    </div>
  )
}
