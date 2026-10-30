import { z } from 'zod/v4'

import { cuid } from './id.schema'

export const PDF_FIELD_KEYS = [
  'patient.name',
  'pathway.name',
  'program.dates',
  'service.name',
] as const

export const PDF_BUILTIN_IMAGES = ['logo-chu', 'lines'] as const

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

// Une couleur fixe, ou celle du parcours du patient avec son repli quand il n'en a pas.
const fill = z.union([
  hex,
  z.strictObject({ token: z.literal('pathway.color'), fallback: hex }),
])

// L'id ne sert qu'a l'editeur et aux rendus, pour suivre un run quand on en coupe ou en retire.
const runStyle = {
  id: z.string().min(1),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
}

// Strict des deux cotes : sans ca, un run portant `text` ET `field` passerait par la
// premiere branche, la clef en trop simplement retiree.
const textRun = z.union([
  z.strictObject({ text: z.string(), ...runStyle }),
  z.strictObject({ field: z.enum(PDF_FIELD_KEYS), ...runStyle }),
])

const geometry = {
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  rotation: z.number().default(0),
}

const textElement = z.object({
  ...geometry,
  kind: z.literal('text'),
  runs: z.array(textRun).min(1),
  fontSize: z.number().positive(),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  color: fill,
  align: z.enum(['left', 'center', 'right']).default('left'),
  vAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
  lineHeight: z.number().positive().optional(),
})

// Un filet est un rect sans rayon : pas de type d'element dedie.
const rectElement = z.object({
  ...geometry,
  kind: z.literal('rect'),
  fill,
  radius: z.number().min(0).default(0),
})

const ellipseElement = z.object({
  ...geometry,
  kind: z.literal('ellipse'),
  fill,
})

const imageElement = z.object({
  ...geometry,
  kind: z.literal('image'),
  source: z.union([
    z.strictObject({ builtin: z.enum(PDF_BUILTIN_IMAGES) }),
    z.strictObject({ assetId: cuid() }),
  ]),
  fit: z.enum(['contain', 'cover', 'fill']).default('contain'),
})

const element = z.discriminatedUnion('kind', [
  textElement,
  rectElement,
  ellipseElement,
  imageElement,
])

const canvasPage = z.object({
  kind: z.literal('canvas'),
  id: z.string().min(1),
  background: hex.default('#ffffff'),
  elements: z.array(element),
})

// Les creneaux du patient, rendus par CalendarPages : de la donnee, pas de la mise en page.
const calendarPage = z.object({
  kind: z.literal('calendar'),
  id: z.string().min(1),
})

export const pdfDesignContentSchema = z.object({
  version: z.literal(1),
  pages: z
    .array(z.discriminatedUnion('kind', [canvasPage, calendarPage]))
    .min(1)
    // Une seule page calendrier : elle rend les creneaux du patient, deux exemplaires
    // repeteraient le meme planning. L'ecran l'empeche deja, mais une regle d'UI n'est pas
    // une garantie — c'est ici que ca se tient.
    .refine(
      (pages) => pages.filter((page) => page.kind === 'calendar').length <= 1,
      { message: 'Un design ne porte qu une seule page calendrier' },
    ),
})

// Forme APRES application des defauts : ce que rend une lecture, et ce que lit le front.
export type PdfDesignContent = z.infer<typeof pdfDesignContentSchema>
// Forme AVANT : ce qu'on ecrit a la main (un preset) et ce qui est stocke en base.
export type PdfDesignContentInput = z.input<typeof pdfDesignContentSchema>
export type PdfFieldKey = (typeof PDF_FIELD_KEYS)[number]
export type PdfBuiltinImage = (typeof PDF_BUILTIN_IMAGES)[number]
