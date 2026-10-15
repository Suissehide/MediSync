import type { CSSProperties } from 'react'

import lines from '../../../assets/images/pdf/lines.png'
import logoCHU from '../../../assets/images/pdf/logo_chx-bdx.png'
import {
  A4_HEIGHT,
  A4_WIDTH,
  type PdfBuiltinImage,
  type PdfCanvasPage,
  type PdfElement,
  type PdfFill,
  type PdfTextElement,
} from '../../../types/pdfDesign.ts'
import { SAMPLE_FIELD_VALUES } from './fields.ts'

// Ce moteur est une APPROXIMATION du rendu PDF, et c'est assume : les metriques d'Helvetica
// different entre react-pdf et le navigateur, donc une ligne peut se couper ailleurs.
// Positions et tailles, elles, sont exactes — un seul facteur d'echelle, dans un seul sens.

const IMAGES: Record<PdfBuiltinImage, string> = { 'logo-chu': logoCHU, lines }

const V_ALIGN: Record<
  PdfTextElement['vAlign'],
  CSSProperties['justifyContent']
> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }

const RENDUS = ['text', 'rect', 'ellipse', 'image']

// Dans l'editeur, la couleur du parcours n'a pas de patient : on montre le repli, qui est
// ce que verra un patient sans parcours.
const remplissage = (fill: PdfFill): string =>
  typeof fill === 'string' ? fill : fill.fallback

export function elementStyle(
  element: PdfElement,
  echelle: number,
): CSSProperties {
  // `base` ne porte PAS la hauteur : le texte la veut en minimum, les formes en hauteur
  // ferme. Chaque branche pose la sienne.
  const base: CSSProperties = {
    position: 'absolute',
    left: element.x * echelle,
    top: element.y * echelle,
    width: element.w * echelle,
    ...(element.rotation
      ? { transform: `rotate(${element.rotation}deg)` }
      : {}),
  }
  const hauteurFerme = { height: element.h * echelle }
  switch (element.kind) {
    case 'text':
      return {
        ...base,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: V_ALIGN[element.vAlign],
        // La police suit l'echelle, sinon le texte deborde d'une boite reduite.
        fontSize: element.fontSize * echelle,
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontWeight: element.bold ? 700 : 400,
        fontStyle: element.italic ? 'italic' : 'normal',
        color: element.color,
        textAlign: element.align,
        lineHeight: element.lineHeight ?? 'normal',
        // La hauteur est un MINIMUM, comme le `grow` de render-pdf : un texte trop long
        // POUSSE au lieu d'etre coupe. Couper ici cacherait dans l'editeur du texte que le
        // PDF imprime — un ecart de regle, pas le simple ecart de metriques que la spec
        // assume entre les deux moteurs.
        minHeight: element.h * echelle,
      }
    case 'rect':
      // Pas de `borderRadius` nul : react-pdf le refuse, et les deux moteurs doivent lire le
      // meme JSON de la meme facon.
      return {
        ...base,
        ...hauteurFerme,
        backgroundColor: remplissage(element.fill),
        ...(element.radius ? { borderRadius: element.radius * echelle } : {}),
      }
    case 'ellipse':
      return {
        ...base,
        ...hauteurFerme,
        backgroundColor: remplissage(element.fill),
        borderRadius: '50%',
      }
    case 'image':
      return { ...base, ...hauteurFerme, objectFit: element.fit }
    default:
      return { ...base, ...hauteurFerme }
  }
}

const contenu = (element: PdfElement) => {
  switch (element.kind) {
    case 'text':
      // Un bloc qui porte tous les runs : le conteneur est en colonne pour `vAlign`, et sans
      // ce bloc chaque run deviendrait une ligne, la ou react-pdf les imbrique dans un SEUL
      // <Text>, donc en ligne.
      return (
        <span style={{ display: 'block' }}>
          {element.runs.map((run, rang) => (
            <span
              // Un run n'a pas d'identite propre : son rang est sa cle, comme dans render-pdf.
              key={`${element.id}-${rang}`}
              style={{
                fontWeight: run.bold ? 700 : undefined,
                fontStyle: run.italic ? 'italic' : undefined,
              }}
            >
              {'field' in run ? SAMPLE_FIELD_VALUES[run.field] : run.text}
            </span>
          ))}
        </span>
      )
    case 'image':
      return 'builtin' in element.source ? (
        <img
          src={IMAGES[element.source.builtin]}
          alt=""
          className="w-full h-full"
          style={{ objectFit: element.fit }}
        />
      ) : null
    default:
      return null
  }
}

type CanvasPageProps = {
  page: PdfCanvasPage
  echelle: number
  selectionId?: string | null
  onSelect?: (id: string) => void
}

export default function CanvasPage({
  page,
  echelle,
  selectionId,
  onSelect,
}: CanvasPageProps) {
  return (
    <div
      className="relative shadow-sm"
      style={{
        width: A4_WIDTH * echelle,
        height: A4_HEIGHT * echelle,
        backgroundColor: page.background,
        // Le decor deborde volontairement : on le coupe au bord de la page, comme le PDF.
        overflow: 'hidden',
      }}
    >
      {page.elements.map((element) => {
        // Un `kind` d'une version future manque a l'ecran, il ne fait pas tomber l'editeur.
        if (!RENDUS.includes(element.kind)) {
          return null
        }
        const selectionne = selectionId === element.id
        return (
          <button
            type="button"
            key={element.id}
            data-testid={`element-${element.id}`}
            data-selectionne={selectionne ? 'true' : 'false'}
            onClick={() => onSelect?.(element.id)}
            style={{
              ...elementStyle(element, echelle),
              outline: selectionne ? '1px solid var(--color-primary)' : 'none',
              cursor: 'move',
              padding: 0,
              border: 'none',
              // Les formes gardent leur remplissage : seuls le texte et l'image laissent
              // voir la page a travers.
              ...(element.kind === 'text' || element.kind === 'image'
                ? { background: 'transparent' }
                : {}),
            }}
          >
            {contenu(element)}
          </button>
        )
      })}
    </div>
  )
}
