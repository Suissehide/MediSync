import { Ellipse, Image, Page, Svg, Text, View } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

import lines from '../../../assets/images/pdf/lines.png'
import logoCHU from '../../../assets/images/pdf/logo_chx-bdx.png'
import type { SourcesImages } from '../../../types/pdfAsset.ts'
import {
  A4_HEIGHT,
  A4_WIDTH,
  type PdfBuiltinImage,
  type PdfDesignContent,
  type PdfElement,
  type PdfFill,
  type PdfTextElement,
} from '../../../types/pdfDesign.ts'
import CalendarPages from '../Patient/pdf/pages/calendar-pages.pdf.tsx'
import { type PdfFieldContext, resolveField } from './fields.ts'

const BUILTIN_IMAGES: Record<PdfBuiltinImage, string> = {
  'logo-chu': logoCHU,
  lines,
}

// Typee par l'union de react-pdf, pas par `string` : un `justifyContent: string` ne passe pas
// son type Style.
const V_ALIGN: Record<
  PdfTextElement['vAlign'],
  'flex-start' | 'center' | 'flex-end'
> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
}

// react-pdf cesure les mots par defaut : un nom un peu long se coupait en plein milieu
// (« Vandenboss-che »). Seul un mot trop large pour une ligne a lui seul est coupe.
const MAX_WORD_LENGTH = 18

const keepWordsWhole = (word: string) => {
  if (word.length <= MAX_WORD_LENGTH) {
    return [word]
  }
  const cut = Math.ceil(word.length / 2)
  return [word.slice(0, cut), word.slice(cut)]
}

const resolveFill = (fill: PdfFill, ctx: PdfFieldContext): string => {
  if (typeof fill === 'string') {
    return fill
  }
  // `||` et non `??` : une couleur vide en base doit aussi tomber sur le repli.
  return ctx.pathways[0]?.templateColor || fill.fallback
}

const fontOf = (bold: boolean) => (bold ? 'Helvetica-Bold' : 'Helvetica')

// Un element dont la boite finirait SOUS le bas de la page (ou a droite du bord droit) est
// ancre depuis ce bord-la, par un decalage negatif, au lieu de l'etre depuis le haut/gauche.
//
// Ce n'est pas cosmetique : avec `top` + `height`, la boite du decor qui deborde volontairement
// (le rond, les lignes en diagonale) finit a 1001 pt sur une page de 842, react-pdf cherche
// alors une coupure de page pour la faire tenir, n'en trouve jamais, et BOUCLE SANS FIN — le
// document ne sort pas du tout. L'ancrage par le bord ne cree aucune boite sous la page.
//
// La regle retombe sur les valeurs du code d'origine : le rond donne bottom -180, les lignes
// -160, exactement ce que `cover-page.pdf.tsx` ecrivait a la main.
const anchor = (start: number, size: number, extent: number) =>
  start + size > extent ? { end: extent - (start + size) } : { start }

// L'ancrage ci-dessus ne suffit QUE tant que le debordement reste modeste. Mesure sur le vrai
// moteur : une boite dont le bord bas depasse DEUX pages (1683,8 pt) fait a nouveau chercher
// une coupure sans fin — `y=800 h=1000` ne termine pas, `y=800 h=870` sort en 23 ms. Depuis
// l'etape 2 un service compose ces valeurs a la main et les ENREGISTRE : un seul design ainsi
// fait eteindrait l'export PDF de tout le service, y compris pour les patients deja suivis.
//
// On borne donc la boite RENDUE, pas le contenu : ce qui est deja en base est protege aussi,
// et le decor qui deborde volontairement (le rond de couverture finit a 1022 pt) passe sans
// etre touche. Une page et demie laisse une demi-page de marge sous le seuil mesure.
const BAS_MAXIMAL = A4_HEIGHT * 1.5

const borner = (y: number, h: number) => {
  const yBorne = Math.min(y, A4_HEIGHT)
  return { y: yBorne, h: Math.max(1, Math.min(h, BAS_MAXIMAL - yBorne)) }
}

// `grow` : la hauteur devient un MINIMUM au lieu d'un plafond. Sans ca react-pdf TRONQUE le
// texte qui depasse, et remplace la fin par une ellipse — un nom de patient de trois lignes
// dans une boite de deux perdait son prenom, en silence.
// `anchorBottom` : un texte aligne en bas grandit alors vers le HAUT, comme le `bottom: 48`
// qu'ecrivait la couverture d'origine, au lieu de descendre sous la page.
const box = (
  element: PdfElement,
  options: { grow?: boolean; anchorBottom?: boolean } = {},
) => {
  const { y, h } = borner(element.y, element.h)
  const vertical = options.anchorBottom
    ? { end: A4_HEIGHT - (y + h) }
    : anchor(y, h, A4_HEIGHT)
  const horizontal = anchor(element.x, element.w, A4_WIDTH)
  return {
    position: 'absolute' as const,
    ...('start' in horizontal
      ? { left: horizontal.start }
      : { right: horizontal.end }),
    ...('start' in vertical
      ? { top: vertical.start }
      : { bottom: vertical.end }),
    width: element.w,
    ...(options.grow ? { minHeight: h } : { height: h }),
    ...(element.rotation
      ? { transform: `rotate(${element.rotation}deg)` }
      : {}),
  }
}

export function renderElement(
  element: PdfElement,
  ctx: PdfFieldContext,
  sources?: SourcesImages,
): ReactElement | null {
  switch (element.kind) {
    // Le View englobant porte l'alignement vertical : une boite de hauteur fixe grandit vers
    // le bas, or le nom du patient est ancre en bas.
    case 'text':
      return (
        <View
          key={element.id}
          style={{
            ...box(element, {
              grow: true,
              anchorBottom: element.vAlign === 'bottom',
            }),
            display: 'flex',
            flexDirection: 'column',
            justifyContent: V_ALIGN[element.vAlign],
          }}
        >
          <Text
            hyphenationCallback={keepWordsWhole}
            style={{
              fontSize: element.fontSize,
              fontFamily: fontOf(element.bold),
              color: resolveFill(element.color, ctx),
              textAlign: element.align,
              ...(element.italic ? { fontStyle: 'italic' } : {}),
              ...(element.lineHeight ? { lineHeight: element.lineHeight } : {}),
            }}
          >
            {element.runs.map((run) => (
              <Text
                key={run.id}
                style={{
                  fontFamily: fontOf(element.bold || run.bold),
                  ...(element.italic || run.italic
                    ? { fontStyle: 'italic' }
                    : {}),
                }}
              >
                {'field' in run ? resolveField(run.field, ctx) : run.text}
              </Text>
            ))}
          </Text>
        </View>
      )

    // Un filet est un rect sans rayon : pas de type d'element dedie. Le rayon n'est emis que
    // s'il est non nul — react-pdf resout `borderRadius: 0` en `undefined` (son resolveur fait
    // `value ? transformUnit(value) : undefined`) puis jette, ce qui abat tout le document.
    case 'rect':
      return (
        <View
          key={element.id}
          style={{
            ...box(element),
            backgroundColor: resolveFill(element.fill, ctx),
            ...(element.radius ? { borderRadius: element.radius } : {}),
          }}
        />
      )

    // Svg plutot qu'un borderRadius en pourcentage : une ellipse non circulaire doit rester
    // exacte. react-pdf 4.3.2 exporte Svg et Ellipse.
    case 'ellipse':
      return (
        <View key={element.id} style={box(element)}>
          <Svg width={element.w} height={element.h}>
            <Ellipse
              cx={element.w / 2}
              cy={element.h / 2}
              rx={element.w / 2}
              ry={element.h / 2}
              fill={resolveFill(element.fill, ctx)}
            />
          </Svg>
        </View>
      )

    case 'image': {
      const src =
        'builtin' in element.source
          ? BUILTIN_IMAGES[element.source.builtin]
          : sources?.[element.source.assetId]
      // Une image deposee puis supprimee, ou un design venu d'un autre service : le document
      // sort sans elle. MESURE (sabotage de cette garde) : react-pdf n'abat PAS le document
      // pour autant — il journalise « Image should receive either a "src" or "source" prop »
      // et saute l'image. Ce que la garde vaut est donc plus modeste que la catastrophe qu'on
      // pourrait imaginer, et reste reel : pas de bruit d'erreur a chaque export, et les deux
      // moteurs lisent le meme JSON de la meme facon — la toile, elle, afficherait sans garde
      // une icone de fichier casse.
      if (!src) {
        return null
      }
      return (
        <Image
          key={element.id}
          src={src}
          style={{ ...box(element), objectFit: element.fit }}
        />
      )
    }

    // Un kind inconnu (preset retouche a la main, version future du schema) est ignore : le
    // reste du document s'imprime quand meme.
    default:
      return null
  }
}

type CalendarProps = Parameters<typeof CalendarPages>[0]

export function pagesOf(
  design: PdfDesignContent,
  ctx: PdfFieldContext,
  calendar: CalendarProps,
  sources?: SourcesImages,
): ReactElement[] {
  return design.pages.map((page) =>
    page.kind === 'calendar' ? (
      <CalendarPages key={page.id} {...calendar} />
    ) : (
      <Page
        key={page.id}
        size="A4"
        style={{ backgroundColor: page.background, padding: 0 }}
      >
        {page.elements.map((element) => renderElement(element, ctx, sources))}
      </Page>
    ),
  )
}
