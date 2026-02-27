import dayjs from 'dayjs'
import { BriefcaseMedical, Plus } from 'lucide-react'
import { Button } from '../../ui/button.tsx'
import type { DiagnosticEducatif } from '../../../types/diagnosticEducatif.ts'

type Props = {
  diagnostics: DiagnosticEducatif[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}

export function DiagnosticSidebar({ diagnostics, selectedId, onSelect, onNew }: Props) {
  return (
    <div className="flex flex-col gap-2 w-64 h-full">
      <div className="flex justify-between items-center px-2 py-1">
        <span className="text-sm font-medium text-text-dark">Diagnostics</span>
        <Button variant="ghost" size="icon-sm" onClick={onNew}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ul className="flex flex-col gap-1 overflow-y-auto flex-1">
        {diagnostics.length === 0 && (
          <li className="text-xs text-text-light text-center py-6">Aucun diagnostic</li>
        )}
        {diagnostics.map((diag) => (
          <li
            key={diag.id}
            onClick={() => onSelect(diag.id)}
            className={`cursor-pointer px-3 py-2 rounded-md flex items-center gap-2 transition-colors ${
              selectedId === diag.id
                ? 'bg-primary/15 text-primary'
                : 'hover:bg-primary/10 text-text-dark'
            }`}
          >
            <BriefcaseMedical className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{diag.title ?? 'Sans titre'}</div>
              <div className="text-xs text-text-light">{dayjs(diag.createdAt).format('DD/MM/YYYY')}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
