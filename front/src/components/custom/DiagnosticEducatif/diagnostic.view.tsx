import dayjs from 'dayjs'
import { Pencil } from 'lucide-react'
import { DIAGNOSTIC_SECTIONS } from '../../../constants/diagnosticEducatif.constant.ts'
import type { DiagnosticEducatif } from '../../../types/diagnosticEducatif.ts'
import { Button } from '../../ui/button.tsx'

type Props = {
  diagnostic: DiagnosticEducatif
  onEdit: () => void
}

export function DiagnosticView({ diagnostic, onEdit }: Props) {
  const activeSections = DIAGNOSTIC_SECTIONS
    .map((section) => ({
      ...section,
      fields: section.fields.filter((f) => diagnostic.activeFields.includes(f.id)),
    }))
    .filter((s) => s.fields.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-text-dark">{diagnostic.title ?? 'Sans titre'}</h2>
          <p className="text-xs text-text-light">{dayjs(diagnostic.createdAt).format('DD/MM/YYYY')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Modifier
        </Button>
      </div>

      {activeSections.length === 0 && (
        <p className="text-sm text-text-light">Aucun champ actif. Cliquez sur "Modifier" pour configurer.</p>
      )}

      {activeSections.map((section) => (
        <div key={section.id} className="border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-text-dark mb-3">{section.label}</h3>
          <div className="flex flex-col gap-2">
            {section.fields.map((field) => {
              const prismaKey = field.id.replace('.', '_')
              const value = diagnostic[prismaKey]
              return (
                <div key={field.id} className="flex justify-between text-sm">
                  <span className="text-text-light">{field.label}</span>
                  <span className="text-text-dark font-medium">
                    {value === null || value === undefined
                      ? '—'
                      : field.type === 'boolean'
                      ? (value ? 'Oui' : 'Non')
                      : String(value)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
