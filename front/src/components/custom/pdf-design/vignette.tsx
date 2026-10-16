import { CalendarDays } from 'lucide-react'

import { cn } from '../../../libs/utils.ts'
import type { SourcesImages } from '../../../types/pdfAsset.ts'
import { A4_HEIGHT, A4_WIDTH, type PdfPage } from '../../../types/pdfDesign.ts'
import CanvasPage from './render-canvas.tsx'

// Une page en petit, au rapport de l'A4. Le meme moteur que la toile, a une autre echelle :
// ce qu'on voit dans la colonne des pages est ce que l'editeur dessine, pas une approximation
// de plus.
export default function Vignette({
  page,
  largeur,
  sources,
  className,
}: {
  page: PdfPage
  largeur: number
  sources?: SourcesImages
  // Le cadre (ombre, bord, contour de selection) differe d'un appelant a l'autre ; le rapport
  // et le moteur de rendu, non.
  className?: string
}) {
  const hauteur = (largeur * A4_HEIGHT) / A4_WIDTH

  // Le calendrier est produit par du code a partir des rendez-vous du patient : il n'y a
  // rien a dessiner ici, et inventer un faux planning mentirait sur ce que le PDF contiendra.
  if (page.kind === 'calendar') {
    return (
      <div
        data-testid={`vignette-${page.id}`}
        className={cn(
          'flex flex-col items-center justify-center gap-1.5 bg-surface-douce text-text-light',
          className,
        )}
        style={{ width: largeur, height: hauteur }}
      >
        <CalendarDays className="w-5 h-5" />
        <span className="text-[11px] font-semibold">Calendrier</span>
      </div>
    )
  }

  return (
    <div
      data-testid={`vignette-${page.id}`}
      className={cn('overflow-hidden bg-white', className)}
      style={{ width: largeur, height: hauteur }}
    >
      <CanvasPage
        page={page}
        echelle={largeur / A4_WIDTH}
        interactif={false}
        sources={sources}
      />
    </div>
  )
}
