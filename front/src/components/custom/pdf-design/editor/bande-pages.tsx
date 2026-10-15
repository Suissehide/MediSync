import { CalendarPlus, FilePlus, Trash2 } from 'lucide-react'

import type { SourcesImages } from '../../../../types/pdfAsset.ts'
import type { PdfPage } from '../../../../types/pdfDesign.ts'
import { MoveButtons } from '../../../settings/iconButton.tsx'
import { Button } from '../../../ui/button.tsx'
import Vignette from '../vignette.tsx'
import type { SensDePage } from './pages.ts'

const LARGEUR_VIGNETTE = 72

type BandePagesProps = {
  pages: PdfPage[]
  courantId: string | null
  peutAjouterCalendrier: boolean
  onChoisir: (id: string) => void
  onAjouterToile: () => void
  onAjouterCalendrier: () => void
  onSupprimer: (id: string) => void
  onDeplacer: (id: string, sens: SensDePage) => void
  sources?: SourcesImages
}

// Le calendrier porte son nom plutot qu'un numero : il n'est pas une page qu'on compose, et
// l'appeler « Page 2 » laisserait croire qu'on peut y poser un texte.
const nomDePage = (page: PdfPage, rangDeToile: number) =>
  page.kind === 'calendar' ? 'Calendrier' : `Page ${rangDeToile + 1}`

export default function BandePages({
  pages,
  courantId,
  peutAjouterCalendrier,
  onChoisir,
  onAjouterToile,
  onAjouterCalendrier,
  onSupprimer,
  onDeplacer,
  sources,
}: BandePagesProps) {
  // Les toiles sont numerotees entre elles : inserer le calendrier au milieu ne doit pas
  // faire sauter la couverture de « Page 1 » a « Page 2 ».
  let rangDeToile = -1

  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-1">
      {pages.map((page, rang) => {
        if (page.kind === 'canvas') {
          rangDeToile += 1
        }
        const nom = nomDePage(page, rangDeToile)
        const courante = page.id === courantId
        return (
          <div
            key={page.id}
            data-testid={`page-${page.id}`}
            data-courante={courante ? 'true' : 'false'}
            className="flex flex-col items-center gap-1 flex-shrink-0"
          >
            {/* « Afficher X » plutot que « X » : le bouton dit ce qu'il fait, et son nom ne
                se confond plus avec celui du bouton Supprimer de la meme carte. */}
            <button
              type="button"
              aria-label={`Afficher ${nom}`}
              onClick={() => onChoisir(page.id)}
              className={
                courante
                  ? 'rounded-xs outline outline-2 outline-primary'
                  : 'rounded-xs outline outline-1 outline-transparent'
              }
            >
              <Vignette
                page={page}
                largeur={LARGEUR_VIGNETTE}
                sources={sources}
              />
            </button>
            <span className="text-[11px] text-text-light" aria-hidden="true">
              {nom}
            </span>
            <div className="flex items-center">
              <MoveButtons
                upLabel="Avancer"
                downLabel="Reculer"
                upDisabled={rang === 0}
                downDisabled={rang === pages.length - 1}
                onUp={() => onDeplacer(page.id, 'avant')}
                onDown={() => onDeplacer(page.id, 'arriere')}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Supprimer ${nom}`}
                disabled={pages.length <= 1}
                onClick={() => onSupprimer(page.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )
      })}

      <div className="flex flex-col gap-2 flex-shrink-0 pt-1">
        <Button variant="outline" size="sm" onClick={onAjouterToile}>
          <FilePlus className="w-4 h-4" />
          Ajouter une page
        </Button>
        {peutAjouterCalendrier && (
          <Button variant="outline" size="sm" onClick={onAjouterCalendrier}>
            <CalendarPlus className="w-4 h-4" />
            Ajouter le calendrier
          </Button>
        )}
      </div>
    </div>
  )
}
