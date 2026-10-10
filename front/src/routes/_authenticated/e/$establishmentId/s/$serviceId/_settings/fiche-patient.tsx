import { createFileRoute, redirect } from '@tanstack/react-router'
import { Archive, ChevronDown, ChevronUp, Pencil, Undo2 } from 'lucide-react'
import { useState } from 'react'

import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import ServiceFieldForm from '@/components/custom/popup/serviceFieldForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { SERVICE_FIELD_TYPE_LABELS } from '@/constants/serviceFieldTypes.tsx'
import { can, useCan } from '@/hooks/useCan.ts'
import {
  useServiceFieldCategoriesQuery,
  useServiceFieldMutations,
  useServiceFieldsQuery,
} from '@/queries/useServiceField.ts'
import type { ServiceField } from '@/types/serviceField.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/fiche-patient',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'referentials:write')) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: FichePatientSettings,
})

function FichePatientSettings() {
  // L'URL se tape a la main : les actions d'ecriture se gardent aussi ici, pas que dans le menu.
  const canManage = useCan('referentials:write')
  const [showArchived, setShowArchived] = useState(false)
  const { fields } = useServiceFieldsQuery()
  const { categories } = useServiceFieldCategoriesQuery()
  const { update, reorder } = useServiceFieldMutations()
  const [archiveTarget, setArchiveTarget] = useState<ServiceField | null>(null)

  const moveField = (
    categoryId: string,
    currentId: string,
    direction: 'up' | 'down',
  ) => {
    const active = fields.filter(
      (f) => f.categoryId === categoryId && !f.archived,
    )
    const index = active.findIndex((f) => f.id === currentId)
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= active.length) {
      return
    }
    // L'ordre envoye doit porter tous les identifiants de la categorie, actifs ET archives (back).
    const all = fields.filter((f) => f.categoryId === categoryId)
    const ids = all.map((f) => f.id)
    const i = ids.indexOf(currentId)
    const j = ids.indexOf(active[targetIndex].id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    reorder.mutate({ categoryId, ids })
  }

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-6 overflow-y-auto">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Fiche patient
          </h1>
          <div className="flex items-center gap-2">
            <Switch
              id="champs-archives"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="champs-archives">Archivés</Label>
          </div>
        </div>

        {categories
          .filter((c) => !c.archived)
          .map(({ id: categoryId, label }) => {
            const shownFields = fields.filter(
              (f) => f.categoryId === categoryId && f.archived === showArchived,
            )
            const activeInCategory = fields.filter(
              (f) => f.categoryId === categoryId && !f.archived,
            )

            return (
              <div key={categoryId} className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <h2 className="text-base font-semibold text-text-dark">
                    {label}
                  </h2>
                  {canManage && !showArchived && (
                    <ServiceFieldForm categoryId={categoryId} />
                  )}
                </div>

                <ul className="flex flex-col gap-2">
                  {shownFields.length === 0 && (
                    <li className="text-sm text-text-light">
                      {showArchived ? 'Aucun champ archivé' : 'Aucun champ'}
                    </li>
                  )}
                  {shownFields.map((f) => {
                    const index = activeInCategory.findIndex(
                      (x) => x.id === f.id,
                    )
                    return (
                      <li
                        key={f.id}
                        className="flex items-center gap-2 border border-border rounded px-3 py-2"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground">
                            {f.label}
                          </span>
                          <span className="text-text-light">
                            {' '}
                            — {SERVICE_FIELD_TYPE_LABELS[f.type]}
                          </span>
                          {f.clinical && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              Clinique
                            </span>
                          )}
                        </div>

                        {canManage && !f.archived && (
                          <>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              aria-label="Monter"
                              disabled={index <= 0 || reorder.isPending}
                              onClick={() => moveField(categoryId, f.id, 'up')}
                            >
                              <ChevronUp className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              aria-label="Descendre"
                              disabled={
                                index === activeInCategory.length - 1 ||
                                reorder.isPending
                              }
                              onClick={() =>
                                moveField(categoryId, f.id, 'down')
                              }
                            >
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                          </>
                        )}

                        {canManage && (
                          <ServiceFieldForm
                            categoryId={categoryId}
                            field={f}
                            trigger={
                              <Button variant="outline" size="sm">
                                <Pencil className="w-4 h-4" />
                                Modifier
                              </Button>
                            }
                          />
                        )}

                        {canManage &&
                          (f.archived ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={update.isPending}
                              onClick={() =>
                                update.mutate({ id: f.id, archived: false })
                              }
                            >
                              <Undo2 className="w-4 h-4" />
                              Restaurer
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setArchiveTarget(f)}
                            >
                              <Archive className="w-4 h-4" />
                              Archiver
                            </Button>
                          ))}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}

        <ConfirmDeleteForm
          open={!!archiveTarget}
          setOpen={(open) => {
            if (!open) {
              setArchiveTarget(null)
            }
          }}
          onConfirm={() => {
            if (archiveTarget) {
              update.mutate({ id: archiveTarget.id, archived: true })
            }
            setArchiveTarget(null)
          }}
          loading={update.isPending}
          title="Archiver le champ"
          description="Il sort de la fiche. Les patients qui le portent conservent leur valeur, et il se restaure depuis le filtre « Archivés »."
          confirmLabel="Archiver"
          confirmLoadingLabel="Archivage..."
          confirmIcon={<Archive className="w-4 h-4" />}
        />
      </div>
    </DashboardLayout>
  )
}
