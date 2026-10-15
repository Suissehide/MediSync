import { CalendarDays } from 'lucide-react'

import { A4_HEIGHT, A4_WIDTH, type PdfPage } from '../../../types/pdfDesign.ts'
import CanvasPage from './render-canvas.tsx'

// Une page en petit, au rapport de l'A4. Le meme moteur que la toile, a une autre echelle :
// ce qu'on voit dans la bande est ce que l'editeur dessine, pas une approximation de plus.
export default function Vignette({
  page,
  largeur,
}: {
  page: PdfPage
  largeur: number
}) {
  const hauteur = (largeur * A4_HEIGHT) / A4_WIDTH

  // Le calendrier est produit par du code a partir des rendez-vous du patient : il n'y a
  // rien a dessiner ici, et inventer un faux planning mentirait sur ce que le PDF contiendra.
  if (page.kind === 'calendar') {
    return (
      <div
        data-testid={`vignette-${page.id}`}
        className="flex flex-col items-center justify-center gap-1 bg-muted text-text-light border border-border rounded-xs"
        style={{ width: largeur, height: hauteur }}
      >
        <CalendarDays className="w-4 h-4" />
        <span className="text-[10px]">Calendrier</span>
      </div>
    )
  }

  return (
    <div
      data-testid={`vignette-${page.id}`}
      className="overflow-hidden border border-border rounded-xs bg-white"
      style={{ width: largeur, height: hauteur }}
    >
      <CanvasPage page={page} echelle={largeur / A4_WIDTH} interactif={false} />
    </div>
  )
}
