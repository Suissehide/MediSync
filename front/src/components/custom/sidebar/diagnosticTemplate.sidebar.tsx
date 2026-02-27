import { LayoutTemplate, Loader2Icon, Plus, Trash2 } from 'lucide-react'

import {
  useDiagnosticTemplateMutations,
  useDiagnosticTemplatesQuery,
} from '../../../queries/useDiagnosticEducatif.ts'
import { useDiagnosticTemplateStore } from '../../../store/useDiagnosticTemplateStore.ts'
import { Button } from '../../ui/button.tsx'

function SidebarDiagnosticTemplate() {
  const { selectedId, setSelectedId } = useDiagnosticTemplateStore()
  const { templates, isPending } = useDiagnosticTemplatesQuery()
  const { createTemplate, deleteTemplate } = useDiagnosticTemplateMutations()

  const handleCreate = () => {
    createTemplate.mutate(
      { name: 'Nouveau template', activeFields: [] },
      { onSuccess: (t) => setSelectedId(t.id) },
    )
  }

  return (
    <>
      <div className="pl-4 pr-2 flex justify-between items-center text-text-sidebar py-2">
        <p>Templates</p>
        <Button variant="gradient" size="icon" onClick={handleCreate}>
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      <div className="px-2 pb-2 flex-1 flex flex-col min-h-0">
        {isPending ? (
          <div className="h-full flex justify-center items-center">
            <Loader2Icon className="size-10 animate-spin text-foreground" />
          </div>
        ) : (
          <ul className="flex-1 flex flex-col min-h-0 space-y-2 overflow-y-auto">
            {(!templates || templates.length === 0) && (
              <li className="bg-sidebar rounded-xl text-xs text-text-sidebar text-center py-36 flex flex-col items-center gap-2">
                <LayoutTemplate className="w-6 h-6 opacity-40" />
                Aucun template
              </li>
            )}
            {templates?.map((t) => {
              const isSelected = selectedId === t.id
              return (
                <li
                  key={t.id}
                  className={`group rounded border transition-all ${
                    isSelected
                      ? 'border-border-dark shadow-sm bg-primary/10'
                      : 'border-border-sidebar bg-sidebar'
                  }`}
                >
                  <div className="flex items-center gap-3 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-primary/10 text-primary">
                        <LayoutTemplate className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text truncate">{t.name}</div>
                        <div className="text-xs text-text-light">
                          {t.activeFields.length} champ(s) actif(s)
                        </div>
                      </div>
                    </button>
                    <Button
                      variant="none"
                      size="icon-sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={() => {
                        deleteTemplate.mutate(t.id, {
                          onSuccess: () => {
                            if (selectedId === t.id) setSelectedId(null)
                          },
                        })
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
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

export default SidebarDiagnosticTemplate
