import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'

import { assetIdsDe } from '@/components/custom/pdf-design/assets.ts'
import EditeurDeDesign from '@/components/custom/pdf-design/editor/editeur-de-design.tsx'
import { can } from '@/hooks/useCan.ts'
import {
  usePdfAssetMutations,
  usePdfAssetQueries,
  useSourcesImages,
} from '@/queries/usePdfAsset.ts'
import {
  usePdfDesignMutations,
  usePdfDesignQueries,
} from '@/queries/usePdfDesign.ts'
import type { PdfDesignContent } from '@/types/pdfDesign.ts'
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

const CONTENU_VIDE: PdfDesignContent = { version: 1, pages: [] }

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
  // Les octets des images que CE design reclame, resolus une fois et donnes aux deux moteurs :
  // la toile, les vignettes de la bande et l'apercu PDF.
  const { sources } = useSourcesImages(
    assetIdsDe(design?.content ?? CONTENU_VIDE),
  )

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
      sources={sources}
      messageAbsent="Ce design n'existe plus, ou appartient à un autre service."
    />
  )
}
