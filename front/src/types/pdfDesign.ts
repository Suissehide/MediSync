// Le schema Zod du back (pdf-design-content.schema.ts) est l'autorite : il valide chaque
// ecriture et applique les defauts. Ce fichier en est la lecture cote front, APRES defauts.
export const PDF_FIELD_KEYS = [
  'patient.name',
  'pathway.name',
  'program.dates',
  'service.name',
] as const
export type PdfFieldKey = (typeof PDF_FIELD_KEYS)[number]

export const PDF_BUILTIN_IMAGES = ['logo-chu', 'lines'] as const
export type PdfBuiltinImage = (typeof PDF_BUILTIN_IMAGES)[number]

export type PdfFill = string | { token: 'pathway.color'; fallback: string }

export type PdfTextRun =
  | { id: string; text: string; bold: boolean; italic: boolean }
  | { id: string; field: PdfFieldKey; bold: boolean; italic: boolean }

type Geometry = {
  id: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export type PdfTextElement = Geometry & {
  kind: 'text'
  runs: PdfTextRun[]
  fontSize: number
  bold: boolean
  italic: boolean
  color: PdfFill
  align: 'left' | 'center' | 'right'
  vAlign: 'top' | 'middle' | 'bottom'
  lineHeight?: number
}

export type PdfRectElement = Geometry & {
  kind: 'rect'
  fill: PdfFill
  radius: number
}

export type PdfEllipseElement = Geometry & { kind: 'ellipse'; fill: PdfFill }

export type PdfImageElement = Geometry & {
  kind: 'image'
  source: { builtin: PdfBuiltinImage } | { assetId: string }
  fit: 'contain' | 'cover' | 'fill'
}

export type PdfElement =
  | PdfTextElement
  | PdfRectElement
  | PdfEllipseElement
  | PdfImageElement

export type PdfCanvasPage = {
  kind: 'canvas'
  id: string
  background: string
  elements: PdfElement[]
}
export type PdfCalendarPage = { kind: 'calendar'; id: string }
export type PdfPage = PdfCanvasPage | PdfCalendarPage

export type PdfDesignContent = { version: 1; pages: PdfPage[] }

// Dimensions de l'A4 en points, l'unite des coordonnees d'un design.
export const A4_WIDTH = 595.28
export const A4_HEIGHT = 841.89
