import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { FilePlus } from 'lucide-react'
import { useState } from 'react'

import { assetIdsDe } from '@/components/custom/pdf-design/assets.ts'
import DesignCard from '@/components/custom/pdf-design/design-card.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import RenamePdfDesignForm from '@/components/custom/popup/renamePdfDesignForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { can } from '@/hooks/useCan.ts'
import { useSourcesImages } from '@/queries/usePdfAsset.ts'
import {
  usePdfDesignMutations,
  usePdfDesignQueries,
} from '@/queries/usePdfDesign.ts'
import type { PdfDesignSummary } from '@/types/pdfDesignList.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient/',
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
  component: PdfPatientSettings,
})

function PdfPatientSettings() {
  const navigate = useNavigate()
  const { establishmentId, serviceId } = Route.useParams()
  const [montrerSupprimes, setMontrerSupprimes] = useState(false)
  const { presets, designs, isPending } = usePdfDesignQueries(montrerSupprimes)

  // Les vignettes des cartes passent par le meme moteur que la toile : sans les octets, une
  // image deposee manquerait ici alors qu'elle s'affiche dans l'editeur. On resout la REUNION
  // des images de tous les designs affiches — la liste est courte, et les octets sont mis en
  // cache par identifiant, donc une image partagee n'est demandee qu'une fois.
  const { sources } = useSourcesImages([
    ...new Set(designs.flatMap((design) => assetIdsDe(design.content))),
  ])
  const {
    duplicateDesign,
    createBlankDesign,
    setDefaultDesign,
    archiveDesign,
    restoreDesign,
  } = usePdfDesignMutations()
  const [aRenommer, setARenommer] = useState<PdfDesignSummary | null>(null)
  const [aSupprimer, setASupprimer] = useState<string | null>(null)

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-6 overflow-auto">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Document patient
          </h1>
          <div className="flex items-center gap-3">
            {!montrerSupprimes && (
              <Button
                variant="outline"
                onClick={() => createBlankDesign.mutate()}
                isLoading={createBlankDesign.isPending}
              >
                <FilePlus className="w-4 h-4" />
                Partir d'une page blanche
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="designs-supprimes"
                checked={montrerSupprimes}
                onCheckedChange={setMontrerSupprimes}
              />
              <Label htmlFor="designs-supprimes">Supprimés</Label>
            </div>
          </div>
        </div>

        {!montrerSupprimes && (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="font-semibold text-foreground">Modèles livrés</h2>
              <p className="text-sm text-text-light">
                Ils ne se modifient pas. Dupliquez-en un pour en faire le vôtre.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {presets.map((preset) => (
                <DesignCard
                  key={preset.id}
                  design={preset}
                  lectureSeule
                  onDupliquer={() => duplicateDesign.mutate(preset.id)}
                />
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-foreground">
            {montrerSupprimes ? 'Designs supprimés' : 'Les designs du service'}
          </h2>
          {!isPending && designs.length === 0 && (
            <p className="text-sm text-text-light">
              {montrerSupprimes
                ? 'Aucun design supprimé.'
                : 'Aucun design propre à ce service. Dupliquez un modèle pour le personnaliser.'}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {designs.map((design) => (
              <DesignCard
                key={design.id}
                design={design}
                lectureSeule={false}
                supprime={montrerSupprimes}
                sources={sources}
                onModifier={() =>
                  navigate({
                    to: '/e/$establishmentId/s/$serviceId/pdf-patient/$designId',
                    params: { establishmentId, serviceId, designId: design.id },
                  })
                }
                onRenommer={() => setARenommer(design)}
                onParDefaut={() => setDefaultDesign.mutate(design.id)}
                onSupprimer={() => setASupprimer(design.id)}
                onRestaurer={() => restoreDesign.mutate(design.id)}
              />
            ))}
          </div>
        </section>

        <RenamePdfDesignForm
          design={aRenommer}
          onClose={() => setARenommer(null)}
        />

        <ConfirmDeleteForm
          open={!!aSupprimer}
          setOpen={(open) => {
            if (!open) {
              setASupprimer(null)
            }
          }}
          onConfirm={() => {
            if (aSupprimer) {
              archiveDesign.mutate(aSupprimer)
            }
            setASupprimer(null)
          }}
          loading={archiveDesign.isPending}
          title="Supprimer le design"
          description="Il sort de la liste de choix du document patient. Les PDF déjà générés ne changent pas, et il se restaure depuis le filtre « Supprimés »."
        />
      </div>
    </DashboardLayout>
  )
}
