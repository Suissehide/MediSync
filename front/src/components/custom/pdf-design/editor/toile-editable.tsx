import { type CSSProperties, type PointerEvent, useState } from 'react'

import type { SourcesImages } from '../../../../types/pdfAsset.ts'
import type { PdfCanvasPage, PdfElement } from '../../../../types/pdfDesign.ts'
import CanvasPage from '../render-canvas.tsx'
import {
  aimanter,
  type Boite,
  deplacer,
  type Poignee,
  redimensionner,
} from './geometrie.ts'

const POIGNEES: { nom: Poignee; curseur: string }[] = [
  { nom: 'nw', curseur: 'nwse-resize' },
  { nom: 'n', curseur: 'ns-resize' },
  { nom: 'ne', curseur: 'nesw-resize' },
  { nom: 'e', curseur: 'ew-resize' },
  { nom: 'se', curseur: 'nwse-resize' },
  { nom: 's', curseur: 'ns-resize' },
  { nom: 'sw', curseur: 'nesw-resize' },
  { nom: 'w', curseur: 'ew-resize' },
]

const COTE = 8

// Position d'une poignee sur le cadre de l'element, en fractions de sa boite.
const fractions = (nom: Poignee) => ({
  fx: nom.includes('w') ? 0 : nom.includes('e') ? 1 : 0.5,
  fy: nom.startsWith('n') ? 0 : nom.startsWith('s') ? 1 : 0.5,
})

type Geste = {
  elementId: string
  poignee: Poignee | null
  depart: Boite
  xEcran: number
  yEcran: number
}

type ToileEditableProps = {
  page: PdfCanvasPage
  echelle: number
  selection: string | null
  onSelect: (id: string | null) => void
  onModifier: (elementId: string, champs: Partial<PdfElement>) => void
  sources?: SourcesImages
  donneesExemple?: boolean
}

export default function ToileEditable({
  page,
  echelle,
  selection,
  onSelect,
  onModifier,
  sources,
  donneesExemple,
}: ToileEditableProps) {
  // Pointer events natifs plutot qu'une bibliotheque : @dnd-kit vise les listes triables, et
  // react-rnd se bat avec le facteur d'echelle — qui doit de toute facon diviser chaque delta.
  const [geste, setGeste] = useState<Geste | null>(null)
  const elementSelectionne = page.elements.find((e) => e.id === selection)

  const commencer = (
    evenement: PointerEvent,
    element: PdfElement,
    poignee: Poignee | null,
  ) => {
    evenement.preventDefault()
    evenement.stopPropagation()
    // Sans capture, un glissement rapide « lache » l'element des que le curseur sort de sa
    // boite.
    evenement.currentTarget.setPointerCapture(evenement.pointerId)
    onSelect(element.id)
    setGeste({
      elementId: element.id,
      poignee,
      depart: { x: element.x, y: element.y, w: element.w, h: element.h },
      xEcran: evenement.clientX,
      yEcran: evenement.clientY,
    })
  }

  const bouger = (evenement: PointerEvent) => {
    if (!geste) {
      return
    }
    const dx = evenement.clientX - geste.xEcran
    const dy = evenement.clientY - geste.yEcran
    const brut = geste.poignee
      ? redimensionner(geste.depart, geste.poignee, dx, dy, echelle)
      : deplacer(geste.depart, dx, dy, echelle)
    // On n'aimante que le deplacement : aimanter pendant un redimensionnement rendrait le
    // geste illisible, la boite sauterait pendant qu'on tire une poignee.
    const voisins = page.elements
      .filter((e) => e.id !== geste.elementId)
      .map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }))
    const boite = geste.poignee ? brut : aimanter(brut, voisins)
    onModifier(geste.elementId, boite)
  }

  const finir = () => setGeste(null)

  const cadre = (element: PdfElement): CSSProperties => ({
    position: 'absolute',
    left: element.x * echelle,
    top: element.y * echelle,
    width: element.w * echelle,
    height: element.h * echelle,
  })

  return (
    // Les gestionnaires vivent sur le conteneur : la capture du pointeur y renvoie les
    // evenements meme quand le curseur sort de la page.
    <div
      className="relative shadow-[0_4px_18px_rgba(4,24,43,.12)]"
      onPointerMove={bouger}
      onPointerUp={finir}
      onPointerCancel={finir}
    >
      <CanvasPage
        sources={sources}
        page={page}
        echelle={echelle}
        selectionId={selection}
        onSelect={onSelect}
        donneesExemple={donneesExemple}
      />

      {/* Une couche de saisie par element, PAR-DESSUS la toile : celle-ci reste un
          composant de rendu pur, reutilisable pour une vignette. */}
      {page.elements.map((element) => (
        <button
          type="button"
          key={element.id}
          aria-label={`Deplacer l element ${element.id}`}
          data-testid={`poignee-deplacement-${element.id}`}
          onPointerDown={(e) => commencer(e, element, null)}
          onClick={() => onSelect(element.id)}
          style={{
            ...cadre(element),
            cursor: 'move',
            background: 'transparent',
            border: 'none',
            padding: 0,
          }}
        />
      ))}

      {elementSelectionne &&
        POIGNEES.map(({ nom, curseur }) => {
          const { fx, fy } = fractions(nom)
          return (
            <button
              type="button"
              key={nom}
              aria-label={`Redimensionner vers ${nom}`}
              data-testid={`poignee-${nom}`}
              onPointerDown={(e) => commencer(e, elementSelectionne, nom)}
              style={{
                position: 'absolute',
                left:
                  (elementSelectionne.x + elementSelectionne.w * fx) * echelle -
                  COTE / 2,
                top:
                  (elementSelectionne.y + elementSelectionne.h * fy) * echelle -
                  COTE / 2,
                width: COTE,
                height: COTE,
                cursor: curseur,
                padding: 0,
              }}
              className="bg-background border border-primary rounded-xs"
            />
          )
        })}
    </div>
  )
}
