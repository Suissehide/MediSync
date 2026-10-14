import { Ellipse, Image, Page, Svg, Text, View } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

import lines from '../../../assets/images/pdf/lines.png'
import logoCHU from '../../../assets/images/pdf/logo_chx-bdx.png'
import type {
  PdfBuiltinImage,
  PdfDesignContent,
  PdfElement,
  PdfFill,
  PdfTextElement,
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
  return ctx.pathways[0]?.templateColor ?? fill.fallback
}

const fontOf = (bold: boolean) => (bold ? 'Helvetica-Bold' : 'Helvetica')

const box = (element: PdfElement) => ({
  position: 'absolute' as const,
  left: element.x,
  top: element.y,
  width: element.w,
  height: element.h,
  ...(element.rotation ? { transform: `rotate(${element.rotation}deg)` } : {}),
})

export function renderElement(
  element: PdfElement,
  ctx: PdfFieldContext,
): ReactElement | null {
  switch (element.kind) {
    // Le View englobant porte l'alignement vertical : une boite de hauteur fixe grandit vers
    // le bas, or le nom du patient est ancre en bas.
    case 'text':
      return (
        <View
          key={element.id}
          style={{
            ...box(element),
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
              color: element.color,
              textAlign: element.align,
              ...(element.lineHeight ? { lineHeight: element.lineHeight } : {}),
            }}
          >
            {element.runs.map((run, index) => (
              <Text
                // Les runs n'ont pas d'identite propre : leur rang est leur cle.
                key={`${element.id}-${index}`}
                style={{
                  fontFamily: fontOf(element.bold || run.bold),
                  ...(run.italic ? { fontStyle: 'italic' } : {}),
                }}
              >
                {'field' in run ? resolveField(run.field, ctx) : run.text}
              </Text>
            ))}
          </Text>
        </View>
      )

    // Un filet est un rect sans rayon : pas de type d'element dedie.
    case 'rect':
      return (
        <View
          key={element.id}
          style={{
            ...box(element),
            backgroundColor: resolveFill(element.fill, ctx),
            borderRadius: element.radius,
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

    case 'image':
      // Les images deposees par un service arrivent a l'etape 4 : une source `assetId` est
      // ignoree plutot que rendue vide.
      if (!('builtin' in element.source)) {
        return null
      }
      return (
        <Image
          key={element.id}
          src={BUILTIN_IMAGES[element.source.builtin]}
          style={{ ...box(element), objectFit: element.fit }}
        />
      )

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
        {page.elements.map((element) => renderElement(element, ctx))}
      </Page>
    ),
  )
}
