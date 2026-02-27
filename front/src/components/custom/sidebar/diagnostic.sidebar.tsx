import dayjs from 'dayjs'
import { BriefcaseMedical, Loader2Icon, Plus } from 'lucide-react'

import type { DiagnosticEducatif } from '../../../types/diagnosticEducatif.ts'
import { Button } from '../../ui/button.tsx'

type Props = {
  diagnostics: DiagnosticEducatif[] | undefined
  isPending: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}

function SidebarDiagnostic({ diagnostics, isPending, selectedId, onSelect, onNew }: Props) {
  return (
    <>
      <div className="pl-4 pr-2 flex justify-between items-center text-text-sidebar py-2">
        <p>Diagnostics</p>
        <Button variant="gradient" size="icon" onClick={onNew}>
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      <div className="mx-2 px-2 pb-2 flex-1 flex flex-col min-h-0">
        {isPending ? (
          <div className="h-full flex justify-center items-center">
            <Loader2Icon className="size-10 animate-spin text-foreground" />
          </div>
        ) : (
          <ul className="flex-1 flex flex-col min-h-0 space-y-2 overflow-y-auto">
            {(!diagnostics || diagnostics.length === 0) && (
              <li className="text-xs text-text-light text-center py-6">Aucun diagnostic</li>
            )}
            {diagnostics?.map((diag) => {
              const isSelected = selectedId === diag.id
              return (
                <li
                  key={diag.id}
                  onClick={() => onSelect(diag.id)}
                  className={`group rounded border transition-all cursor-pointer hover:shadow-md ${
                    isSelected
                      ? 'border-border-dark shadow-sm bg-primary/10'
                      : 'border-border-sidebar bg-sidebar'
                  }`}
                >
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-primary/10 text-primary">
                      <BriefcaseMedical className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text truncate">
                        {diag.title ?? 'Sans titre'}
                      </div>
                      <div className="text-xs text-text-light">
                        {dayjs(diag.createdAt).format('DD/MM/YYYY')}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

export default SidebarDiagnostic
