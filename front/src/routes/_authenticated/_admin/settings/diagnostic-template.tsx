import { createFileRoute } from '@tanstack/react-router'
import { LayoutTemplate } from 'lucide-react'
import { useEffect, useState } from 'react'

import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import { Switch } from '../../../../components/ui/switch.tsx'
import { DIAGNOSTIC_SECTIONS } from '../../../../constants/diagnosticEducatif.constant.ts'
import {
  useDiagnosticTemplateMutations,
  useDiagnosticTemplatesQuery,
} from '../../../../queries/useDiagnosticEducatif.ts'
import { useDiagnosticTemplateStore } from '../../../../store/useDiagnosticTemplateStore.ts'
import type { DiagnosticEducatifTemplate } from '../../../../types/diagnosticEducatif.ts'

export const Route = createFileRoute(
  '/_authenticated/_admin/settings/diagnostic-template',
)({ component: DiagnosticTemplateSettings })

function DiagnosticTemplateSettings() {
  const { selectedId } = useDiagnosticTemplateStore()
  const { templates } = useDiagnosticTemplatesQuery()
  const { updateTemplate } = useDiagnosticTemplateMutations()

  const editing = templates?.find((t) => t.id === selectedId) ?? null
  const [editingName, setEditingName] = useState('')

  useEffect(() => {
    if (editing) setEditingName(editing.name)
  }, [editing?.id])

  const handleToggleField = (template: DiagnosticEducatifTemplate, fieldId: string) => {
    const activeFields = template.activeFields.includes(fieldId)
      ? template.activeFields.filter((id) => id !== fieldId)
      : [...template.activeFields, fieldId]
    updateTemplate.mutate({ id: template.id, activeFields })
  }

  return (
    <DashboardLayout components={['diagnosticTemplate']}>
      <div className="flex flex-col gap-4 h-full">
        <h1 className="text-xl font-semibold text-text-dark">
          Templates de diagnostic éducatif
        </h1>

        {!editing && (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-text-light">
            <LayoutTemplate className="h-10 w-10" />
            <p className="text-sm">Sélectionnez ou créez un template dans la barre latérale</p>
          </div>
        )}

        {editing && (
          <div className="flex flex-col gap-4">
            <input
              className="h-9 rounded-md border border-border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring w-72"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => {
                if (editingName !== editing.name) {
                  updateTemplate.mutate({ id: editing.id, name: editingName })
                }
              }}
            />

            {DIAGNOSTIC_SECTIONS.map((section) => (
              <div key={section.id} className="border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-text-dark mb-3">{section.label}</h3>
                <div className="flex flex-col gap-2 pl-2">
                  {section.fields.map((field) => (
                    <div key={field.id} className="flex items-center gap-3">
                      <Switch
                        checked={editing.activeFields.includes(field.id)}
                        onCheckedChange={() => handleToggleField(editing, field.id)}
                      />
                      <span className="text-sm text-text-dark">{field.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
