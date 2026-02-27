import { useState } from 'react'
import { DIAGNOSTIC_SECTIONS } from '../../../constants/diagnosticEducatif.constant.ts'
import type { DiagnosticEducatif } from '../../../types/diagnosticEducatif.ts'
import { Button } from '../../ui/button.tsx'
import { Switch } from '../../ui/switch.tsx'

type Props = {
  diagnostic: DiagnosticEducatif
  onSave: (updates: Partial<DiagnosticEducatif>) => void
  onCancel: () => void
}

export function DiagnosticForm({ diagnostic, onSave, onCancel }: Props) {
  const [activeFields, setActiveFields] = useState<string[]>(diagnostic.activeFields)
  const [values, setValues] = useState<Record<string, unknown>>({ ...diagnostic })

  const toggleField = (fieldId: string) => {
    setActiveFields((prev) =>
      prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
    )
  }

  const handleSubmit = () => {
    onSave({ activeFields, ...values })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-text-dark">Modifier le diagnostic</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
          <Button size="sm" onClick={handleSubmit}>Enregistrer</Button>
        </div>
      </div>

      {DIAGNOSTIC_SECTIONS.map((section) => (
        <div key={section.id} className="border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-text-dark mb-3">{section.label}</h3>
          <div className="flex flex-col gap-3">
            {section.fields.map((field) => {
              const isActive = activeFields.includes(field.id)
              const prismaKey = field.id.replace('.', '_')

              return (
                <div key={field.id} className="flex items-center gap-3">
                  <Switch checked={isActive} onCheckedChange={() => toggleField(field.id)} />
                  <span className={`text-sm flex-1 ${isActive ? 'text-text-dark' : 'text-text-light'}`}>
                    {field.label}
                  </span>
                  {isActive && (
                    <div className="w-48">
                      {field.type === 'boolean' ? (
                        <Switch
                          checked={Boolean(values[prismaKey])}
                          onCheckedChange={(v) => setValues((prev) => ({ ...prev, [prismaKey]: v }))}
                        />
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={String(values[prismaKey] ?? '')}
                          onChange={(e) => setValues((prev) => ({ ...prev, [prismaKey]: e.target.value }))}
                          className="w-full h-8 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
