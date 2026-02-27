import { createFileRoute } from '@tanstack/react-router'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import { Button } from '../../../../components/ui/button.tsx'
import { Switch } from '../../../../components/ui/switch.tsx'
import { DIAGNOSTIC_SECTIONS } from '../../../../constants/diagnosticEducatif.constant.ts'
import {
  useDiagnosticTemplateMutations,
  useDiagnosticTemplatesQuery,
} from '../../../../queries/useDiagnosticEducatif.ts'
import type { DiagnosticEducatifTemplate } from '../../../../types/diagnosticEducatif.ts'

export const Route = createFileRoute(
  '/_authenticated/_admin/settings/diagnostic-template',
)({ component: DiagnosticTemplateSettings })

function DiagnosticTemplateSettings() {
  const { templates } = useDiagnosticTemplatesQuery()
  const { createTemplate, updateTemplate, deleteTemplate } = useDiagnosticTemplateMutations()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const editing = templates?.find((t) => t.id === editingId) ?? null

  useEffect(() => {
    if (editing) setEditingName(editing.name)
  }, [editing?.id])

  const handleCreate = () => {
    createTemplate.mutate(
      { name: 'Nouveau template', activeFields: [] },
      { onSuccess: (t) => setEditingId(t.id) },
    )
  }

  const handleToggleField = (template: DiagnosticEducatifTemplate, fieldId: string) => {
    const activeFields = template.activeFields.includes(fieldId)
      ? template.activeFields.filter((id) => id !== fieldId)
      : [...template.activeFields, fieldId]
    updateTemplate.mutate({ id: template.id, activeFields })
  }

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold text-text-dark">Templates de diagnostic éducatif</h1>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4" />
            Nouveau template
          </Button>
        </div>

        <div className="flex gap-4 flex-1">
          {/* Liste */}
          <ul className="w-64 flex flex-col gap-2">
            {templates?.map((t) => (
              <li
                key={t.id}
                onClick={() => setEditingId(t.id)}
                className={`cursor-pointer px-3 py-2 rounded-md border transition-colors flex justify-between items-center ${
                  editingId === t.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-card'
                }`}
              >
                <span className="text-sm text-text-dark">{t.name}</span>
                <Button
                  variant="none"
                  size="icon-sm"
                  onClick={(e) => { e.stopPropagation(); deleteTemplate.mutate(t.id) }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>

          {/* Éditeur */}
          {editing && (
            <div className="flex-1 border border-border rounded-lg p-4 flex flex-col gap-4">
              <input
                className="h-9 rounded-md border border-border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring w-64"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => {
                  if (editingName !== editing.name) {
                    updateTemplate.mutate({ id: editing.id, name: editingName })
                  }
                }}
              />
              {DIAGNOSTIC_SECTIONS.map((section) => (
                <div key={section.id}>
                  <h3 className="text-sm font-semibold text-text-dark mb-2">{section.label}</h3>
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
      </div>
    </DashboardLayout>
  )
}
