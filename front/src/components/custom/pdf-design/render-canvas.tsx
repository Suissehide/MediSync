import type { CSSProperties, ReactNode } from 'react'

import lines from '../../../assets/images/pdf/lines.png'
import logoCHU from '../../../assets/images/pdf/logo_chx-bdx.png'
import type { SourcesImages } from '../../../types/pdfAsset.ts'
import {
  A4_HEIGHT,
  A4_WIDTH,
  type PdfBuiltinImage,
  type PdfCanvasPage,
  type PdfElement,
  type PdfFieldKey,
  type PdfFill,
  type PdfTextElement,
} from '../../../types/pdfDesign.ts'
import { LIBELLES_DONNEES, SAMPLE_FIELD_VALUES } from './fields.ts'

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
        color: remplissage(element.color),
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

// Interrupteur coupe : une donnee se montre comme une ETIQUETTE portant son nom, plutot que
// par sa valeur d'exemple. C'est le seul moyen de voir d'un coup d'oeil ce qui, dans un texte,
// changera d'un patient a l'autre.
const donnee = (cle: PdfFieldKey, exemple: boolean): ReactNode =>
  exemple ? (
    SAMPLE_FIELD_VALUES[cle]
  ) : (
    <span className="rounded-[3px] px-1 bg-blue-100 text-primary-dark">
      {LIBELLES_DONNEES[cle]}
    </span>
  )

const contenu = (
  element: PdfElement,
  sources?: SourcesImages,
  donneesExemple = true,
) => {
  switch (element.kind) {
    case 'text':
      // Un bloc qui porte tous les runs : le conteneur est en colonne pour `vAlign`, et sans
      // ce bloc chaque run deviendrait une ligne, la ou react-pdf les imbrique dans un SEUL
      // <Text>, donc en ligne.
      return (
        <span style={{ display: 'block' }}>
          {element.runs.map((run) => (
            <span
              key={run.id}
              style={{
                fontWeight: run.bold ? 700 : undefined,
                fontStyle: run.italic ? 'italic' : undefined,
              }}
            >
              {'field' in run ? donnee(run.field, donneesExemple) : run.text}
            </span>
          ))}
        </span>
      )
    case 'image': {
      const src =
        'builtin' in element.source
          ? IMAGES[element.source.builtin]
          : sources?.[element.source.assetId]
      // Une image deposee puis supprimee, ou venue d'un autre service : la page sort sans
      // elle, plutot qu'avec l'icone de fichier casse d'un `src` vide.
      return src ? (
        <img
          src={src}
          alt=""
          className="w-full h-full"
          style={{ objectFit: element.fit }}
        />
      ) : null
    }
    default:
      return null
  }
}

type CanvasPageProps = {
  page: PdfCanvasPage
  echelle: number
  selectionId?: string | null
  onSelect?: (id: string) => void
  // `false` pour une miniature : les elements deviennent de simples boites, sans clic ni
  // arret de tabulation.
  interactif?: boolean
  // Les octets des images deposees, deja resolus. Optionnel : un design qui n'en porte pas
  // n'a rien a fournir.
  sources?: SourcesImages
  // `false` remplace chaque valeur d'exemple par le NOM de la donnee, en etiquette. Vrai par
  // defaut : une vignette montre le document tel qu'il sortira.
  donneesExemple?: boolean
}

export default function CanvasPage({
  page,
  echelle,
  selectionId,
  onSelect,
  interactif = true,
  sources,
  donneesExemple = true,
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
        const style = {
          ...elementStyle(element, echelle),
          // 1,5 px comme le cadre que la toile editable dessine par-dessus : les deux bords
          // se superposent au lieu de faire un double trait d'epaisseurs differentes.
          outline: selectionne ? '1.5px solid var(--color-primary)' : undefined,
          padding: 0,
          border: 'none',
          // Les formes gardent leur remplissage : seuls le texte et l'image laissent
          // voir la page a travers.
          ...(element.kind === 'text' || element.kind === 'image'
            ? { background: 'transparent' }
            : {}),
        }
        // Prefixe quand la page est inerte : l'editeur rend la MEME page deux fois, en
        // grand et en vignette. Sans cela, `getByTestId('element-x')` trouve deux noeuds et
        // une lecture de `data-selectionne` peut viser la copie, toujours « false ».
        const commun = {
          'data-testid': interactif
            ? `element-${element.id}`
            : `apercu-element-${element.id}`,
          'data-selectionne': selectionne ? 'true' : 'false',
        }
        if (!interactif) {
          return (
            <div key={element.id} {...commun} style={style}>
              {contenu(element, sources, donneesExemple)}
            </div>
          )
        }
        return (
          <button
            type="button"
            key={element.id}
            {...commun}
            onClick={() => onSelect?.(element.id)}
            // Le survol souligne ce que le clic prendra. En classe et non en style : un
            // `:hover` ne s'ecrit pas en style inline, et l'outline de la selection,
            // lui, doit rester inline pour gagner sur celui du survol.
            className={
              selectionne ? undefined : 'hover:outline-1 hover:outline-ring'
            }
            style={{ ...style, cursor: 'move' }}
          >
            {contenu(element, sources, donneesExemple)}
          </button>
        )
      })}
    </div>
  )
}
