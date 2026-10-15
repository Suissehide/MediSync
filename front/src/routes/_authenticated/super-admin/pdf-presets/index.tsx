import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { FilePlus } from 'lucide-react'
import { useState } from 'react'

import DesignCard from '@/components/custom/pdf-design/design-card.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import {
  usePdfDesignPresetMutations,
  usePdfDesignPresetQueries,
} from '@/queries/usePdfDesignPreset.ts'

// Ecran hors de tout tenant : la garde est celle du layout (`../../super-admin.tsx`), qui
// rend `notFound()` a un compte sans le drapeau. Aucune permission de la matrice n'est
// consultee ici, et aucune API de tenant n'est appelee.
export const Route = createFileRoute(
  '/_authenticated/super-admin/pdf-presets/',
)({
  component: SuperAdminPdfPresets,
})

function SuperAdminPdfPresets() {
  const navigate = useNavigate()
  const [montrerSupprimes, setMontrerSupprimes] = useState(false)
  const { presets, isPending } = usePdfDesignPresetQueries(montrerSupprimes)
  const {
    createBlankPreset,
    duplicatePreset,
    archivePreset,
    restorePreset,
    reorderPresets,
  } = usePdfDesignPresetMutations()
  const [aSupprimer, setASupprimer] = useState<string | null>(null)

  // La liste ENTIERE dans le nouvel ordre : le back refuse tout ce qui ne decrit pas
  // exactement l'ensemble existant.
  const deplacer = (rang: number, vers: number) => {
    const ids = presets.map((p) => p.id)
    const [deplace] = ids.splice(rang, 1)
    if (!deplace) {
      return
    }
    ids.splice(vers, 0, deplace)
    reorderPresets.mutate(ids)
  }

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-6 overflow-auto">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Documents patient
          </h1>
          <div className="flex items-center gap-3">
            {!montrerSupprimes && (
              <Button
                variant="outline"
                onClick={() => createBlankPreset.mutate()}
                isLoading={createBlankPreset.isPending}
              >
                <FilePlus className="w-4 h-4" />
                Partir d'une page blanche
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="modeles-supprimes"
                checked={montrerSupprimes}
                onCheckedChange={setMontrerSupprimes}
              />
              <Label htmlFor="modeles-supprimes">Supprimés</Label>
            </div>
          </div>
        </div>

        <p className="text-sm text-text-light">
          Ces modèles sont proposés à tous les services, qui les dupliquent pour
          en faire les leurs. Une copie déjà faite est figée : la retoucher ici
          ne la change pas.
        </p>

        {!isPending && presets.length === 0 && (
          <p className="text-sm text-text-light">
            {montrerSupprimes
              ? 'Aucun modèle supprimé.'
              : 'Aucun modèle livré. Partez d’une page blanche pour en composer un.'}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {presets.map((preset, rang) => (
            <DesignCard
              key={preset.id}
              design={preset}
              lectureSeule={false}
              supprime={montrerSupprimes}
              onModifier={() =>
                navigate({
                  to: '/super-admin/pdf-presets/$presetId',
                  params: { presetId: preset.id },
                })
              }
              onDupliquer={() => duplicatePreset.mutate(preset.id)}
              onSupprimer={() => setASupprimer(preset.id)}
              onRestaurer={() => restorePreset.mutate(preset.id)}
              onMonter={() => deplacer(rang, rang - 1)}
              onDescendre={() => deplacer(rang, rang + 1)}
              monterImpossible={rang === 0}
              descendreImpossible={rang === presets.length - 1}
            />
          ))}
        </div>

        <ConfirmDeleteForm
          open={!!aSupprimer}
          setOpen={(open) => {
            if (!open) {
              setASupprimer(null)
            }
          }}
          onConfirm={() => {
            if (aSupprimer) {
              archivePreset.mutate(aSupprimer)
            }
            setASupprimer(null)
          }}
          loading={archivePreset.isPending}
          title="Supprimer le modèle"
          description="Il n'est plus proposé aux services. Les copies déjà faites ne changent pas, et il se restaure depuis le filtre « Supprimés »."
        />
      </div>
    </DashboardLayout>
  )
}
