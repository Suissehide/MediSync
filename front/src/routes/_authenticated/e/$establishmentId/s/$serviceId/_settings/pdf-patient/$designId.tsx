import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'

import EditeurDeDesign from '@/components/custom/pdf-design/editor/editeur-de-design.tsx'
import { can } from '@/hooks/useCan.ts'
import {
  usePdfAssetMutations,
  usePdfAssetQueries,
} from '@/queries/usePdfAsset.ts'
import {
  usePdfDesignMutations,
  usePdfDesignQueries,
} from '@/queries/usePdfDesign.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient/$designId',
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
  component: PdfDesignEditor,
})

// Cet ecran ne fait que RESOUDRE les donnees : l'edition elle-meme vit dans
// `EditeurDeDesign`, que l'ecran super-admin des modeles livres monte aussi.
function PdfDesignEditor() {
  const navigate = useNavigate()
  const { establishmentId, serviceId, designId } = Route.useParams()
  const { designs, isPending } = usePdfDesignQueries()
  const { saveContent } = usePdfDesignMutations()
  const design = designs.find((d) => d.id === designId)

  const { assets } = usePdfAssetQueries()
  const { deposerImage } = usePdfAssetMutations()

  return (
    <EditeurDeDesign
      design={design ?? null}
      chargement={isPending}
      enregistrementEnCours={saveContent.isPending}
      onEnregistrer={(contenu) =>
        saveContent.mutateAsync({ id: designId, content: contenu })
      }
      onRetour={() =>
        navigate({
          to: '/e/$establishmentId/s/$serviceId/pdf-patient',
          params: { establishmentId, serviceId },
        })
      }
      assets={assets}
      onDeposer={(fichier) => deposerImage.mutateAsync(fichier)}
      messageAbsent="Ce design n'existe plus, ou appartient à un autre service."
    />
  )
}
