import { CalendarPlus, FilePlus } from 'lucide-react'
import { type DragEvent, type KeyboardEvent, useState } from 'react'

import type { SourcesImages } from '../../../../types/pdfAsset.ts'
import type { PdfPage } from '../../../../types/pdfDesign.ts'
import { Button } from '../../../ui/button.tsx'
import Vignette from '../vignette.tsx'
import { nomsDePages } from './pages.ts'

const LARGEUR_VIGNETTE = 119

type ColonnePagesProps = {
  pages: PdfPage[]
  courantId: string | null
  peutAjouterCalendrier: boolean
  onChoisir: (id: string) => void
  onAjouterToile: () => void
  onAjouterCalendrier: () => void
  // `cible` est un rang d'INSERTION lu avant le retrait : « pose cette page avant la n-ieme ».
  onDeposer: (id: string, cible: number) => void
  sources?: SourcesImages
}

// Le trait d'insertion. Decale de 24 px a gauche pour s'aligner sur la vignette, et en marges
// negatives pour tenir dans l'ecart entre deux pages sans les ecarter davantage.
const Indicateur = () => (
  <span
    data-testid="indicateur-depot"
    className="h-[3px] rounded bg-primary ml-6 -mt-2 -mb-1.5"
  />
)

export default function ColonnePages({
  pages,
  courantId,
  peutAjouterCalendrier,
  onChoisir,
  onAjouterToile,
  onAjouterCalendrier,
  onDeposer,
  sources,
}: ColonnePagesProps) {
  // Le rang TIRE et le rang d'insertion survole. Local au composant : rien d'autre n'a besoin
  // de savoir qu'un glissement est en cours.
  const [tire, setTire] = useState<number | null>(null)
  const [cible, setCible] = useState<number | null>(null)
  const noms = nomsDePages(pages)

  const finir = () => {
    setTire(null)
    setCible(null)
  }

  const deposer = (evenement: DragEvent) => {
    evenement.preventDefault()
    const page = tire === null ? null : pages[tire]
    if (page && cible !== null) {
      onDeposer(page.id, cible)
    }
    finir()
  }

  // La moitie HAUTE insere avant la page survolee, la moitie basse apres : c'est la regle qui
  // rend le dernier rang atteignable, et elle dit la meme chose que le trait affiche.
  const survoler = (evenement: DragEvent, rang: number) => {
    evenement.preventDefault()
    const boite = evenement.currentTarget.getBoundingClientRect()
    setCible(evenement.clientY < boite.top + boite.height / 2 ? rang : rang + 1)
  }

  // Alt+fleche fait le meme geste sans souris. Les deux bornes sont celles du glissement :
  // monter d'un rang insere avant la page precedente, descendre insere apres la suivante.
  const auClavier = (evenement: KeyboardEvent, page: PdfPage, rang: number) => {
    if (!evenement.altKey) {
      return
    }
    const vers =
      evenement.key === 'ArrowUp'
        ? rang - 1
        : evenement.key === 'ArrowDown'
          ? rang + 2
          : null
    if (vers === null) {
      return
    }
    evenement.preventDefault()
    // Les raccourcis de l'editeur vivent sur la fenetre : sans cet arret, la meme frappe
    // deplacerait aussi l'element selectionne.
    evenement.stopPropagation()
    onDeposer(page.id, vers)
  }

  return (
    <div className="border-r border-border flex flex-col min-h-0">
      <div className="px-4 pt-3.5 pb-2 flex justify-between items-baseline">
        <span className="text-[13px] font-semibold text-text-dark">Pages</span>
        <span className="text-xs text-text-sidebar">
          {pages.length} page{pages.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Une vraie liste : les pages EN SONT une, et un `li` porte son role — donc la zone
          de depot du bas aussi, sans role bricole sur un `div`. */}
      <ul className="flex-1 min-h-0 overflow-auto px-4 pb-3 pt-1 flex flex-col gap-3.5">
        {pages.map((page, rang) => {
          const nom = noms[rang] ?? ''
          const courante = page.id === courantId
          // Aucun trait quand la position ne change pas : deposer sur soi-meme, ou juste
          // apres soi, laisse la liste telle quelle — l'afficher promettrait un mouvement.
          const indique =
            tire !== null &&
            cible === rang &&
            rang !== tire &&
            rang !== tire + 1
          return (
            <li key={page.id} className="flex flex-col gap-3.5">
              {indique && <Indicateur />}
              <button
                type="button"
                data-testid={`page-${page.id}`}
                data-courante={courante ? 'true' : 'false'}
                // « Afficher X » plutot que « X » : le bouton dit ce qu'il fait.
                aria-label={`Afficher ${nom}`}
                aria-roledescription="page déplaçable"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  // Firefox n'arme un glissement qu'avec une charge utile.
                  e.dataTransfer.setData('text/plain', page.id)
                  setTire(rang)
                  setCible(null)
                }}
                onDragOver={(e) => survoler(e, rang)}
                onDrop={deposer}
                onDragEnd={finir}
                onKeyDown={(e) => auClavier(e, page, rang)}
                onClick={() => onChoisir(page.id)}
                style={{ opacity: tire === rang ? 0.4 : 1 }}
                className="flex items-start gap-2 text-left cursor-grab"
              >
                <span
                  className={
                    courante
                      ? 'w-4 pt-0.5 text-xs font-semibold text-primary'
                      : 'w-4 pt-0.5 text-xs font-semibold text-text-sidebar'
                  }
                  aria-hidden="true"
                >
                  {rang + 1}
                </span>
                <span className="flex flex-col gap-1.5">
                  <Vignette
                    page={page}
                    largeur={LARGEUR_VIGNETTE}
                    sources={sources}
                    className={
                      courante
                        ? 'shadow-[0_1px_4px_rgba(4,24,43,.14)] outline-2 outline-offset-2 outline-primary'
                        : 'shadow-[0_1px_4px_rgba(4,24,43,.14)]'
                    }
                  />
                  <span
                    className={
                      courante
                        ? 'text-xs font-semibold text-foreground flex items-center gap-1.5'
                        : 'text-xs text-text-light flex items-center gap-1.5'
                    }
                    aria-hidden="true"
                  >
                    {nom}
                    {page.kind === 'calendar' && (
                      <span className="text-[10px] font-semibold px-1.5 rounded-lg bg-muted text-text-light">
                        auto
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          )
        })}

        {/* « Mettre en dernier » a besoin d'une cible : la moitie basse de la derniere
            vignette y suffit, mais 40 px de plus rendent le geste facile. */}
        <li
          data-testid="depot-fin"
          className="min-h-10 flex-shrink-0 flex flex-col"
          onDragOver={(e) => {
            e.preventDefault()
            setCible(pages.length)
          }}
          onDrop={deposer}
        >
          {tire !== null &&
            cible === pages.length &&
            tire !== pages.length - 1 && <Indicateur />}
        </li>
      </ul>

      <div className="px-4 pt-3 pb-4 border-t border-border flex flex-col gap-1.5">
        <Button variant="outline" onClick={onAjouterToile}>
          <FilePlus className="w-4 h-4" />
          Ajouter une page
        </Button>
        {peutAjouterCalendrier && (
          <Button variant="outline" onClick={onAjouterCalendrier}>
            <CalendarPlus className="w-4 h-4" />
            Ajouter le calendrier
          </Button>
        )}
        <span className="text-[11px] text-text-sidebar leading-snug">
          Glissez une vignette pour changer l'ordre.
        </span>
      </div>
    </div>
  )
}
