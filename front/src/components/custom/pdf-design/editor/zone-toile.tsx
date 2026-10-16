import { Maximize2, Minus, Plus } from 'lucide-react'
import type { RefObject } from 'react'

import { cn } from '../../../../libs/utils.ts'
import type { SourcesImages } from '../../../../types/pdfAsset.ts'
import type { PdfElement, PdfPage } from '../../../../types/pdfDesign.ts'
import { Button } from '../../../ui/button.tsx'
import { SAMPLE_FIELD_VALUES } from '../fields.ts'
import ApercuCalendrier from './apercu-calendrier.tsx'
import BarreOutils from './barre-outils.tsx'
import type { KindElement } from './elements.ts'
import ToileEditable from './toile-editable.tsx'
import { palierSuivant } from './zoom.ts'

// Un clic qui ne touche ni un element ni une poignee est un clic DANS LE VIDE : il
// deselectionne.
const DANS_UN_ELEMENT = '[data-testid^="element-"],[data-testid^="poignee-"]'

type ZoneToileProps = {
  // `null` tant que le design n'est pas arrive : la zone reste vide plutot que de montrer
  // l'apercu du calendrier sur un contenu qui n'existe pas encore.
  page: PdfPage | null
  echelle: number
  // Le cadre MESURE : c'est lui que l'editeur observe pour faire entrer la page entiere.
  cadre: RefObject<HTMLDivElement | null>
  selection: string | null
  onSelect: (id: string | null) => void
  onModifier: (elementId: string, champs: Partial<PdfElement>) => void
  onAjouter: (kind: KindElement) => void
  donneesExemple: boolean
  onDonneesExemple: (valeur: boolean) => void
  sources?: SourcesImages
  // `true` quand l'echelle est celle qui fait tenir la page dans le cadre — l'etat de depart,
  // et celui ou le cadre n'a rien a faire defiler.
  ajuste: boolean
  onZoomer: (sens: 1 | -1) => void
  onAjuster: () => void
}

// La colonne centrale : les outils au-dessus de la page, la page, et le pied qui dit a quelle
// echelle on la voit.
export default function ZoneToile({
  page,
  echelle,
  cadre,
  selection,
  onSelect,
  onModifier,
  onAjouter,
  donneesExemple,
  onDonneesExemple,
  sources,
  ajuste,
  onZoomer,
  onAjuster,
}: ZoneToileProps) {
  const toile = page?.kind === 'canvas' ? page : null

  return (
    <div className="bg-muted flex flex-col items-center min-h-0 relative">
      <BarreOutils
        onAjouter={onAjouter}
        donneesExemple={donneesExemple}
        onDonneesExemple={onDonneesExemple}
        actif={!!toile}
      />
      {/* Le defilement n'existe QUE zoome : ajuste, la page tient par construction, et un
          cadre defilant y ferait osciller la mesure (une barre apparait, la largeur utile
          baisse, l'echelle aussi, la barre disparait...). La marge vit sur le cadre et non sur
          son contenu : `contentRect` l'exclut, donc l'echelle ajustee en tient compte. */}
      <div
        ref={cadre}
        className={cn(
          'flex-1 min-h-0 w-full p-4',
          ajuste ? 'overflow-hidden' : 'overflow-auto',
        )}
        // Sur `pointerdown`, comme tous les gestes de la toile : les poignees arretent la
        // propagation du leur, donc seul un pointeur pose DANS LE VIDE arrive ici.
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).closest(DANS_UN_ELEMENT)) {
            onSelect(null)
          }
        }}
      >
        {/* `w-fit min-w-full` : centre tant qu'il reste de la place, et aussi large que la
            page des qu'elle deborde — un `justify-center` seul rogne le bord gauche d'un
            contenu plus large que son cadre, et ce bord devient inatteignable. */}
        <div className="w-fit min-w-full min-h-full flex items-start justify-center">
          {toile && (
            <ToileEditable
              page={toile}
              echelle={echelle}
              selection={selection}
              onSelect={onSelect}
              onModifier={onModifier}
              sources={sources}
              donneesExemple={donneesExemple}
            />
          )}
          {page?.kind === 'calendar' && <ApercuCalendrier echelle={echelle} />}
        </div>
      </div>
      <div className="h-10 flex-shrink-0 flex items-center gap-4 text-xs text-text-light">
        <span>A4 · 595 × 842 pt</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="transparent"
            size="icon-sm"
            aria-label="Dézoomer"
            disabled={palierSuivant(echelle, -1) === echelle}
            onClick={() => onZoomer(-1)}
          >
            <Minus className="w-3.5 h-3.5" />
          </Button>
          {/* Le pourcentage EST le bouton du retour a l'ajustement : c'est la seule chose
              qu'on veut faire de ce chiffre une fois qu'on a zoome. */}
          <Button
            variant="transparent"
            title="Ajuster à la fenêtre"
            disabled={ajuste}
            onClick={onAjuster}
            className="h-6 px-1.5 text-xs font-normal text-text-light tabular-nums"
          >
            {Math.round(echelle * 100)} %
            {!ajuste && <Maximize2 className="w-3 h-3" />}
          </Button>
          <Button
            variant="transparent"
            size="icon-sm"
            aria-label="Zoomer"
            disabled={palierSuivant(echelle, 1) === echelle}
            onClick={() => onZoomer(1)}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        <span>
          Le patient d'exemple ({SAMPLE_FIELD_VALUES['patient.name']}) n'est
          jamais un vrai dossier.
        </span>
      </div>
    </div>
  )
}
