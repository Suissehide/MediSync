import type { PdfDesignContentInput } from '../../interfaces/http/fastify/schemas/pdf-design-content.schema'

export const REFERENCE_PRESET_ID = 'preset-smcv-reference'
export const REFERENCE_PRESET_NAME = 'Programme SMCV'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 36
const CONTENT_W = PAGE_W - MARGIN * 2

// Rapports mesures sur les fichiers : logo_chx-bdx.png 799x410, lines.png 1304x1600.
const LOGO_RATIO = 1.9488
const LINES_RATIO = 0.815

const CLOSING_H = 66

// `y` et `h` remplacent des hauteurs automatiques : un texte rallonge debordera de son pave,
// et l'apercu le montre. Portes par le conseil lui-meme plutot que par un second tableau a
// garder aligne par index.
const TIPS = [
  {
    y: 221,
    h: 65,
    title: 'Soyez ponctuel·le',
    text: "La ponctualité est essentielle au bon déroulement des séances. Cela permet de respecter le travail de l'équipe soignante, mais aussi celui des autres patients. Merci d'arriver à l'heure indiquée pour chaque activité.",
  },
  {
    y: 298,
    h: 78,
    title: "Ce qu'il faut apporter chaque jour",
    text: "Pour pratiquer une activité physique en toute sécurité et dans de bonnes conditions, il est important de porter des vêtements et des chaussures confortables et adaptés à l'effort. Des casiers sont à votre disposition dans les vestiaires. Merci d'apporter un cadenas ! Pensez à prendre une gourde d'eau pour vous hydrater pendant et après l'effort.",
  },
  {
    y: 388,
    h: 65,
    title: 'Prenez un petit-déjeuner avant de venir',
    text: "Il est essentiel de manger le matin avant votre venue. Un petit-déjeuner équilibré vous donnera l'énergie nécessaire pour participer activement à votre programme.",
  },
  {
    y: 465,
    h: 65,
    title: 'Soyez reposé·e',
    text: "Un bon repos est indispensable pour votre récupération et pour profiter pleinement de chaque activité. Essayez de venir reposé·e, en forme, et l'écoute de votre corps.",
  },
]

// Le meme decor en haut a droite sur la couverture et sur les conseils :
// top: -160, right: -160, width 280, rotate 45deg.
const linesTopRight = (id: string) => ({
  id,
  kind: 'image' as const,
  source: { builtin: 'lines' as const },
  x: PAGE_W + 160 - 280,
  y: -160,
  w: 280,
  h: 280 / LINES_RATIO,
  rotation: 45,
})

const tipElements = () =>
  TIPS.flatMap((tip, index) => {
    const n = index + 1
    // Le contenu commence apres le padding du pave (12), la puce (10) et sa marge (10).
    const contentX = MARGIN + 32
    const contentW = CONTENT_W - 44
    return [
      {
        id: `tip-${n}-box`,
        kind: 'rect' as const,
        x: MARGIN,
        y: tip.y,
        w: CONTENT_W,
        h: tip.h,
        fill: '#fce7f3',
        radius: 6,
      },
      {
        id: `tip-${n}-dot`,
        kind: 'ellipse' as const,
        x: MARGIN + 12,
        y: tip.y + 14,
        w: 10,
        h: 10,
        fill: '#ec4899',
      },
      {
        id: `tip-${n}-title`,
        kind: 'text' as const,
        x: contentX,
        y: tip.y + 12,
        w: contentW,
        h: 14,
        runs: [{ text: tip.title }],
        fontSize: 11,
        bold: true,
        color: '#1f2937',
      },
      {
        id: `tip-${n}-body`,
        kind: 'text' as const,
        x: contentX,
        y: tip.y + 28,
        w: contentW,
        h: tip.h - 28,
        runs: [{ text: tip.text }],
        fontSize: 9,
        color: '#4b5563',
        lineHeight: 1.4,
      },
    ]
  })

export const REFERENCE_PRESET_CONTENT: PdfDesignContentInput = {
  version: 1,
  pages: [
    {
      kind: 'canvas',
      id: 'cover',
      elements: [
        // Le decor d'abord : l'ordre du tableau est l'ordre de peinture.
        linesTopRight('cover-lines-tr'),
        {
          id: 'cover-lines-br',
          kind: 'image',
          source: { builtin: 'lines' },
          // right: 120, bottom: -160, width 260, rotate 220deg.
          x: PAGE_W - 120 - 260,
          y: PAGE_H + 160 - 260 / LINES_RATIO,
          w: 260,
          h: 260 / LINES_RATIO,
          rotation: 220,
        },
        {
          id: 'cover-circle',
          kind: 'ellipse',
          // bottom: -180, left: -60, 380x380.
          x: -60,
          y: PAGE_H + 180 - 380,
          w: 380,
          h: 380,
          fill: { token: 'pathway.color', fallback: '#e6aff6' },
        },
        {
          id: 'cover-logo',
          kind: 'image',
          source: { builtin: 'logo-chu' },
          x: MARGIN,
          y: MARGIN,
          w: 140,
          h: 140 / LOGO_RATIO,
        },
        {
          id: 'cover-title',
          kind: 'text',
          x: 0,
          y: 342,
          w: PAGE_W,
          h: 86,
          runs: [{ text: 'SMCV' }],
          fontSize: 72,
          bold: true,
          color: '#e05a5a',
          align: 'center',
        },
        {
          id: 'cover-underline',
          kind: 'rect',
          x: (PAGE_W - 120) / 2,
          y: 432,
          w: 120,
          h: 4,
          fill: '#e05a5a',
        },
        {
          id: 'cover-program',
          kind: 'text',
          x: 0,
          y: 445,
          w: PAGE_W,
          h: 34,
          runs: [{ field: 'pathway.name' }],
          fontSize: 28,
          bold: true,
          color: '#7c3aed',
          align: 'center',
        },
        {
          id: 'cover-dates',
          kind: 'text',
          x: 0,
          y: 503,
          w: PAGE_W,
          h: 20,
          runs: [{ field: 'program.dates' }],
          fontSize: 16,
          bold: true,
          color: '#221755',
          align: 'center',
        },
        {
          id: 'cover-patient',
          kind: 'text',
          x: MARGIN,
          // bottom: 48 ; la boite tient deux lignes de 32 pt et le nom s'ancre en bas.
          y: PAGE_H - 48 - 78,
          w: CONTENT_W,
          h: 78,
          runs: [{ field: 'patient.name' }],
          fontSize: 32,
          bold: true,
          color: '#221755',
          vAlign: 'bottom',
        },
      ],
    },
    { kind: 'calendar', id: 'calendar' },
    {
      kind: 'canvas',
      id: 'tips',
      elements: [
        linesTopRight('tips-lines-tr'),
        {
          id: 'tips-title',
          kind: 'text',
          x: MARGIN,
          // padding 36 de la page, puis marginTop 60.
          y: 96,
          w: CONTENT_W,
          h: 101,
          runs: [{ text: 'Comment\nréussir\nson programme ?' }],
          fontSize: 28,
          bold: true,
          color: '#221755',
          lineHeight: 1.2,
        },
        ...tipElements(),
        {
          id: 'closing-box',
          kind: 'rect',
          x: MARGIN,
          y: PAGE_H - MARGIN - CLOSING_H,
          w: CONTENT_W,
          h: CLOSING_H,
          fill: '#fce7f3',
          radius: 6,
        },
        {
          id: 'closing-text',
          kind: 'text',
          x: MARGIN + 12,
          y: PAGE_H - MARGIN - CLOSING_H + 12,
          w: CONTENT_W - 24,
          h: 26,
          runs: [
            {
              text: "Souvenez-vous que ce programme est fait pour vous, et que chaque effort vous fait vous rapprocher d'un meilleur équilibre de vie. ",
              bold: true,
            },
            { text: "Toute l'équipe SMCV est là pour vous accompagner." },
          ],
          fontSize: 9,
          color: '#1f2937',
          lineHeight: 1.4,
        },
        {
          id: 'closing-contact',
          kind: 'text',
          x: MARGIN + 12,
          y: PAGE_H - MARGIN - CLOSING_H + 42,
          w: CONTENT_W - 24,
          h: 14,
          runs: [
            {
              text: "En cas de doute ou d'absence, merci de contacter le service au ",
            },
            { text: '05 57 62 32 91', bold: true },
          ],
          fontSize: 9,
          color: '#1f2937',
          lineHeight: 1.4,
        },
      ],
    },
  ],
}
