import { createFileRoute, useNavigate } from '@tanstack/react-router'

import EditeurDeDesign from '@/components/custom/pdf-design/editor/editeur-de-design.tsx'
import {
  usePdfDesignPresetMutations,
  usePdfDesignPresetQueries,
} from '@/queries/usePdfDesignPreset.ts'

// Le MEME editeur que les designs d'un service, monte sur une autre source. Ecran hors de
// tout tenant : la garde est celle du layout (`../../super-admin.tsx`).
export const Route = createFileRoute(
  '/_authenticated/super-admin/pdf-presets/$presetId',
)({
  component: SuperAdminPdfPresetEditor,
})

function SuperAdminPdfPresetEditor() {
  const navigate = useNavigate()
  const { presetId } = Route.useParams()
  const { presets, isPending } = usePdfDesignPresetQueries()
  const { saveContent, renamePreset, setDraftPreset } =
    usePdfDesignPresetMutations()
  const preset = presets.find((p) => p.id === presetId)

  // NI `assets` NI `onDeposer` : un modele livre n'utilise que les images de l'application
  // (la spec exclut une table d'images globale). L'inspecteur ne montre donc ni la liste du
  // service — il n'y a pas de service ici — ni un champ de depot, qui promettrait une image
  // qu'aucun modele ne pourrait porter.
  return (
    <EditeurDeDesign
      design={preset ?? null}
      chargement={isPending}
      enregistrementEnCours={saveContent.isPending}
      onEnregistrer={(contenu) =>
        saveContent.mutateAsync({ id: presetId, content: contenu })
      }
      onRenommer={(name) => renamePreset.mutateAsync({ id: presetId, name })}
      onTerminer={() =>
        setDraftPreset.mutateAsync({ id: presetId, isDraft: false })
      }
      onRetour={() => navigate({ to: '/super-admin/pdf-presets' })}
      messageAbsent="Ce modèle n'existe plus, ou vient d'être supprimé."
    />
  )
}
