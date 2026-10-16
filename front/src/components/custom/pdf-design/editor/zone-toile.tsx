import type { RefObject } from 'react'

import type { SourcesImages } from '../../../../types/pdfAsset.ts'
import type { PdfElement, PdfPage } from '../../../../types/pdfDesign.ts'
import { SAMPLE_FIELD_VALUES } from '../fields.ts'
import ApercuCalendrier from './apercu-calendrier.tsx'
import BarreOutils from './barre-outils.tsx'
import type { KindElement } from './elements.ts'
import ToileEditable from './toile-editable.tsx'

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
      <div
        ref={cadre}
        className="flex-1 min-h-0 w-full pt-4 overflow-hidden flex items-start justify-center"
        // Sur `pointerdown`, comme tous les gestes de la toile : les poignees arretent la
        // propagation du leur, donc seul un pointeur pose DANS LE VIDE arrive ici.
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).closest(DANS_UN_ELEMENT)) {
            onSelect(null)
          }
        }}
      >
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
      <div className="h-10 flex-shrink-0 flex items-center gap-4 text-xs text-text-light">
        <span>A4 · 595 × 842 pt · {Math.round(echelle * 100)} %</span>
        <span>
          Le patient d'exemple ({SAMPLE_FIELD_VALUES['patient.name']}) n'est
          jamais un vrai dossier.
        </span>
      </div>
    </div>
  )
}
