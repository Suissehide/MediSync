import {
  A4_HEIGHT,
  A4_WIDTH,
  type PdfElement,
} from '../../../../types/pdfDesign.ts'

export type KindElement = PdfElement['kind']

const LARGEUR = 200
const HAUTEUR = 40
// Decalage d'une copie : sans lui elle se cacherait pile sous l'original, et le clic
// suivant reprendrait l'original.
const DECALAGE = 10

// Chaque fabrique rend un element COMPLET, dans la forme d'apres defauts que le front
// manipule : le back revalide a l'enregistrement, il ne complete pas.
// Pas d'arrondi ici : la page fait 595,28 pt de large, un centre arrondi est decentre de
// 0,36 pt. Le premier glissement arrondira (`auPoint`, geometrie.ts) ; d'ici la, exact.
const centre = (w: number, h: number) => ({
  x: (A4_WIDTH - w) / 2,
  y: (A4_HEIGHT - h) / 2,
  w,
  h,
  rotation: 0,
})

export const nouvelElement = (kind: KindElement): PdfElement => {
  const id = crypto.randomUUID()
  switch (kind) {
    case 'text':
      return {
        ...centre(LARGEUR, HAUTEUR),
        id,
        kind: 'text',
        // Jamais `runs: []` : le schema le refuse, et un texte vide serait invisible.
        runs: [
          {
            id: crypto.randomUUID(),
            text: 'Nouveau texte',
            bold: false,
            italic: false,
          },
        ],
        fontSize: 14,
        bold: false,
        italic: false,
        color: '#04182b',
        align: 'left',
        vAlign: 'top',
      }
    case 'rect':
      return {
        ...centre(LARGEUR, HAUTEUR),
        id,
        kind: 'rect',
        fill: '#e05a5a',
        radius: 0,
      }
    case 'ellipse':
      return {
        ...centre(120, 120),
        id,
        kind: 'ellipse',
        fill: { token: 'pathway.color', fallback: '#e6aff6' },
      }
    case 'image':
      return {
        ...centre(160, 80),
        id,
        kind: 'image',
        // Seule source possible a l'etape 2 : les images livrees. Le depot arrive en etape 4.
        source: { builtin: 'logo-chu' },
        fit: 'contain',
      }
  }
}

// Le meme element, sous une autre identite et a la meme place. Sert a la copie d'une PAGE,
// ou decaler chaque element de 10 pt deplacerait tout le dessin.
// Les runs sont un tableau : partages, chaque frappe sur l'original suivrait la copie.
export const copieDElement = (element: PdfElement): PdfElement => {
  const base = { ...element, id: crypto.randomUUID() }
  return base.kind === 'text' ? { ...base, runs: [...base.runs] } : base
}

export const dupliquerElement = (element: PdfElement): PdfElement => ({
  ...copieDElement(element),
  x: element.x + DECALAGE,
  y: element.y + DECALAGE,
})
