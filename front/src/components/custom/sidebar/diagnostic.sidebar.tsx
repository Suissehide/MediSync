import { useParams } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { BriefcaseMedical, Loader2Icon, Plus } from 'lucide-react'

import { useDiagnosticsByPatientQuery } from '../../../queries/useDiagnosticEducatif.ts'
import { useDiagnosticStore } from '../../../store/useDiagnosticStore.ts'
import { Button } from '../../ui/button.tsx'
import AddDiagnosticForm from '../popup/addDiagnosticForm.tsx'

function SidebarDiagnostic() {
  const { patientID } = useParams({ strict: false })
  const { selectedId, setSelectedId } = useDiagnosticStore()

  const { diagnostics, isPending } = useDiagnosticsByPatientQuery(
    patientID ?? '',
  )

  if (!patientID) {
    return null
  }

  return (
    <>
      <div className="pl-4 pr-2 flex justify-between items-center text-text-sidebar py-2">
        <p>Diagnostics éducatifs</p>
        <AddDiagnosticForm
          patientId={patientID}
          trigger={
            <Button variant="gradient" size="icon">
              <Plus className="w-5 h-5" />
            </Button>
          }
        />
      </div>

      <div className="px-2 pb-2 flex-1 flex flex-col min-h-0">
        {isPending ? (
          <div className="h-full flex justify-center items-center">
            <Loader2Icon className="size-10 animate-spin text-foreground" />
          </div>
        ) : (
          <ul className="flex-1 flex flex-col min-h-0 space-y-2 overflow-y-auto">
            {(!diagnostics || diagnostics.length === 0) && (
              <li className="bg-sidebar rounded-xl text-xs text-text-sidebar text-center py-36 flex flex-col items-center gap-2">
                <BriefcaseMedical className="w-6 h-6 opacity-40" />
                Aucun diagnostic éducatif
              </li>
            )}
            {diagnostics?.map((diag) => {
              const isSelected = selectedId === diag.id
              return (
                <li
                  key={diag.id}
                  className={`group rounded border transition-all ${
                    isSelected
                      ? 'border-border-dark shadow-sm bg-primary/10'
                      : 'border-border-sidebar bg-sidebar'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(diag.id)}
                    className="w-full text-left cursor-pointer hover:shadow-md"
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
                  </button>
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
