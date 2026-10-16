import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { FilePlus } from 'lucide-react'
import { useState } from 'react'

import { assetIdsDe } from '@/components/custom/pdf-design/assets.ts'
import DesignCard from '@/components/custom/pdf-design/design-card.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import RenamePdfDesignForm from '@/components/custom/popup/renamePdfDesignForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'
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

const GRILLE = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

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
    renameDesign,
    setDefaultDesign,
    archiveDesign,
    restoreDesign,
  } = usePdfDesignMutations()
  const [aRenommer, setARenommer] = useState<PdfDesignSummary | null>(null)
  const [aSupprimer, setASupprimer] = useState<string | null>(null)

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-7 overflow-auto">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-text-dark text-[22px] font-semibold">
              Document patient
            </h1>
            <p className="text-sm text-text-light">
              Le modèle de PDF utilisé pour exporter les rendez-vous d'un
              patient.
            </p>
          </div>
          {/* Un segmente, pas un interrupteur : « Supprimés » n'est pas une option qu'on
              ajoute a la vue, c'est l'AUTRE vue — les deux listes ne se melangent jamais. */}
          <ToggleGroup
            aria-label="Designs à afficher"
            value={montrerSupprimes ? 'supprimes' : 'actifs'}
            // Radix laisse un segmente simple se DESELECTIONNER : sans cette garde, un
            // second clic sur l'onglet actif n'afficherait plus aucune des deux vues.
            onValueChange={(valeur) =>
              valeur && setMontrerSupprimes(valeur === 'supprimes')
            }
          >
            <ToggleGroupItem value="actifs">Actifs</ToggleGroupItem>
            <ToggleGroupItem value="supprimes">Supprimés</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <section className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-semibold text-foreground">
              {montrerSupprimes
                ? 'Designs supprimés'
                : 'Les designs du service'}
            </h2>
            {!montrerSupprimes && (
              <p className="text-[13px] text-text-light">
                Celui par défaut sert à chaque export ; les autres restent
                proposés au moment d'exporter.
              </p>
            )}
          </div>
          {!isPending && designs.length === 0 && (
            <p className="text-sm text-text-light">
              {montrerSupprimes
                ? 'Aucun design supprimé.'
                : 'Aucun design propre à ce service. Dupliquez un modèle pour le personnaliser.'}
            </p>
          )}
          <div className={GRILLE}>
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
            {/* Une case de la grille, et non plus un bouton de l'en-tete : creer un design
                est un geste de la meme famille que dupliquer celui d'a cote. Jamais dans la
                corbeille, ou rien ne se cree. */}
            {!montrerSupprimes && (
              <button
                type="button"
                onClick={() => createBlankDesign.mutate()}
                disabled={createBlankDesign.isPending}
                className="border-[1.5px] border-dashed border-border-dark rounded-xl min-h-[300px] p-5 flex flex-col items-center justify-center gap-2.5 cursor-pointer hover:border-primary disabled:opacity-50"
              >
                <span className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                  <FilePlus className="w-5 h-5 text-primary" />
                </span>
                <span className="text-[15px] font-semibold text-foreground">
                  Partir d'une page blanche
                </span>
                <span className="text-[13px] text-text-light text-center">
                  Ou dupliquez un modèle livré ci-dessous.
                </span>
              </button>
            )}
          </div>
        </section>

        {!montrerSupprimes && (
          <section className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-base font-semibold text-foreground">
                Modèles livrés
              </h2>
              <p className="text-[13px] text-text-light">
                Ils ne se modifient pas. Dupliquez-en un pour en faire le vôtre.
              </p>
            </div>
            <div className={GRILLE}>
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

        <RenamePdfDesignForm
          design={aRenommer}
          onClose={() => setARenommer(null)}
          onRenommer={(params) => renameDesign.mutateAsync(params)}
          enCours={renameDesign.isPending}
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
