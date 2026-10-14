import { describe, expect, it } from 'vitest'

import type { Patient, PatientPathway } from '../../../types/patient.ts'
import type {
  PdfDesignContent,
  PdfElement,
  PdfEllipseElement,
  PdfFill,
  PdfRectElement,
} from '../../../types/pdfDesign.ts'
import type { PdfFieldContext } from './fields.ts'
import { pagesOf, renderElement } from './render-pdf.tsx'

const geometry = { id: 'e1', x: 10, y: 20, w: 100, h: 30, rotation: 0 }

// `ReactElement.props` est `unknown` avec les types de React 19 : une sonde locale donne au
// test de quoi lire le style et les enfants sans parsemer le fichier d'assertions non typees.
type Sonde = {
  props: {
    wrap?: boolean
    style?: Record<string, unknown>
    children?: { props: { hyphenationCallback: (word: string) => string[] } }
  }
}
const sonde = (node: unknown) => node as Sonde

const texte: PdfElement = {
  ...geometry,
  kind: 'text',
  runs: [
    { text: 'Bonjour ', bold: true, italic: false },
    { field: 'patient.name', bold: false, italic: false },
  ],
  fontSize: 12,
  bold: false,
  italic: false,
  color: '#221755',
  align: 'center',
  vAlign: 'bottom',
}

const ellipse = (fill: PdfFill): PdfEllipseElement => ({
  ...geometry,
  kind: 'ellipse',
  fill,
})

const pathway = (over: Partial<PatientPathway>): PatientPathway => ({
  pathwayID: 'pw1',
  templateID: 't1',
  templateName: null,
  templateColor: null,
  templateMainTag: null,
  startDate: '2026-05-11T09:00:00.000Z',
  priority: null,
  ...over,
})

const ctx = (over: Partial<PdfFieldContext> = {}): PdfFieldContext => ({
  patient: { id: 'p1', firstName: 'Jean', lastName: 'Dupont' } as Patient,
  pathways: [],
  upcomingSlots: [],
  serviceName: 'SMCV',
  ...over,
})

// Rend la suite des textes d'un arbre d'elements React, sans monter quoi que ce soit :
// react-pdf ne se rend pas dans jsdom, et le mapping se lit sur l'arbre.
const textesDe = (node: unknown): string[] => {
  if (typeof node === 'string') {
    return [node]
  }
  if (Array.isArray(node)) {
    return node.flatMap(textesDe)
  }
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: unknown } }).props
    return textesDe(props?.children)
  }
  return []
}

describe('renderElement', () => {
  // Un element dont la boite finirait sous le bas de la page est ancre depuis ce bord.
  // Sans ca, react-pdf cherche une coupure de page pour faire tenir le decor qui deborde
  // volontairement (le rond, les lignes), n'en trouve jamais, et BOUCLE SANS FIN : le
  // document ne sort pas du tout. La regle retombe sur les valeurs du code d'origine.
  it('ancre par le BAS un element qui deborde sous la page', () => {
    // Le rond de la couverture : y 641.89, h 380 -> finit a 1021.89 pour une page de 841.89.
    const rond: PdfElement = {
      ...ellipse('#e6aff6'),
      x: -60,
      y: 641.89,
      w: 380,
      h: 380,
    }
    const style = sonde(renderElement(rond, ctx())).props.style
    expect(style).not.toHaveProperty('top')
    // 841.89 - (641.89 + 380) : exactement le `bottom: -180` que la couverture ecrivait.
    expect(style?.bottom).toBeCloseTo(-180, 2)
  })

  it('ancre par la DROITE un element qui deborde du bord droit', () => {
    // Les lignes en haut a droite : x 475.28, w 280 -> finissent a 755.28 pour 595.28.
    const lignes: PdfElement = {
      ...geometry,
      kind: 'image',
      source: { builtin: 'lines' },
      fit: 'contain',
      x: 475.28,
      y: -160,
      w: 280,
      h: 343.56,
    }
    const style = sonde(renderElement(lignes, ctx())).props.style
    expect(style).not.toHaveProperty('left')
    expect(style?.right).toBeCloseTo(-160, 2)
    // Le haut deborde aussi, mais vers le HAUT : aucune coupure de page a craindre, on garde `top`.
    expect(style?.top).toBe(-160)
  })

  it('place un element a ses coordonnees, en points', () => {
    const node = sonde(renderElement(texte, ctx()))
    expect(node.props.style).toMatchObject({
      position: 'absolute',
      left: 10,
      top: 20,
      width: 100,
      height: 30,
    })
  })

  it('traduit vAlign en justifyContent', () => {
    expect(sonde(renderElement(texte, ctx())).props.style).toMatchObject({
      justifyContent: 'flex-end',
    })
  })

  it('n applique aucune rotation quand elle vaut zero', () => {
    expect(sonde(renderElement(texte, ctx())).props.style).not.toHaveProperty(
      'transform',
    )
  })

  it('applique la rotation en degres quand elle est posee', () => {
    const tourne = { ...texte, rotation: 45 }
    expect(sonde(renderElement(tourne, ctx())).props.style).toMatchObject({
      transform: 'rotate(45deg)',
    })
  })

  it('resout un run de donnee et garde le texte fixe autour', () => {
    expect(textesDe(renderElement(texte, ctx()))).toEqual([
      'Bonjour ',
      'Dupont Jean',
    ])
  })

  it('rend un remplissage par jeton avec la couleur du parcours', () => {
    const rond = ellipse({ token: 'pathway.color', fallback: '#e6aff6' })
    const avecParcours = ctx({ pathways: [pathway({ templateColor: '#123456' })] })
    expect(JSON.stringify(renderElement(rond, avecParcours))).toContain('#123456')
  })

  // Review Focus 2 : sans parcours, le repli du preset.
  it('se replie sur la couleur par defaut quand le patient n a pas de parcours', () => {
    const rond = ellipse({ token: 'pathway.color', fallback: '#e6aff6' })
    expect(JSON.stringify(renderElement(rond, ctx()))).toContain('#e6aff6')
  })

  it('se replie aussi quand le parcours existe mais sans couleur', () => {
    const rond = ellipse({ token: 'pathway.color', fallback: '#e6aff6' })
    const sansCouleur = ctx({ pathways: [pathway({ templateColor: null })] })
    expect(JSON.stringify(renderElement(rond, sansCouleur))).toContain('#e6aff6')
  })

  it('rend une couleur fixe telle quelle', () => {
    const pave: PdfRectElement = {
      ...geometry,
      kind: 'rect',
      fill: '#fce7f3',
      radius: 6,
    }
    expect(sonde(renderElement(pave, ctx())).props.style).toMatchObject({
      backgroundColor: '#fce7f3',
      borderRadius: 6,
    })
  })

  // react-pdf REFUSE un borderRadius de zero : son resolveur fait
  // `value ? transformUnit(value) : undefined` et jette sur undefined. Un filet est un rect de
  // rayon zero, donc tout le document tombait.
  it('n emet aucun borderRadius pour un rect de rayon zero', () => {
    const filet: PdfRectElement = {
      ...geometry,
      kind: 'rect',
      fill: '#e05a5a',
      radius: 0,
    }
    expect(sonde(renderElement(filet, ctx())).props.style).not.toHaveProperty(
      'borderRadius',
    )
  })

  it('ignore une image dont la source est un asset, l upload arrivant plus tard', () => {
    const image = {
      ...geometry,
      kind: 'image',
      source: { assetId: 'cm0000000000000000000000' },
      fit: 'contain',
    } as PdfElement
    expect(renderElement(image, ctx())).toBeNull()
  })

  // Review Focus 4 : un kind inconnu n abat pas le PDF entier.
  it('ignore un element de type inconnu', () => {
    const inconnu = { ...geometry, kind: 'qrcode' } as unknown as PdfElement
    expect(renderElement(inconnu, ctx())).toBeNull()
  })

  // Review Focus 3 : le nom long garde ses mots entiers.
  it('garde les mots entiers et ne coupe que ceux trop larges pour une ligne', () => {
    const node = sonde(renderElement(texte, ctx()))
    const callback = node.props.children?.props.hyphenationCallback
    if (!callback) {
      throw new Error('aucun hyphenationCallback sur le Text rendu')
    }
    expect(callback('Vandenbossche')).toEqual(['Vandenbossche'])
    expect(callback('Dupont')).toEqual(['Dupont'])
    // 19 caracteres : au-dela de la limite de 18, coupe en deux.
    expect(callback('Aaaaaaaaaabbbbbbbbb')).toEqual([
      'Aaaaaaaaaa',
      'bbbbbbbbb',
    ])
  })
})

describe('pagesOf', () => {
  const design = (pages: PdfDesignContent['pages']): PdfDesignContent => ({
    version: 1,
    pages,
  })
  const calendar = {} as never

  // Review Focus 5 : zero ou deux pages calendrier, comportement defini.
  it('rend une page calendrier a chaque occurrence', () => {
    const deux = design([
      { kind: 'calendar', id: 'c1' },
      { kind: 'calendar', id: 'c2' },
    ])
    expect(pagesOf(deux, ctx(), calendar)).toHaveLength(2)
  })

  it('ne rend aucun calendrier quand le design n en contient pas', () => {
    const sans = design([
      { kind: 'canvas', id: 'p1', background: '#ffffff', elements: [] },
    ])
    expect(pagesOf(sans, ctx(), calendar)).toHaveLength(1)
  })

  it('garde l ordre des pages du design', () => {
    const trois = design([
      { kind: 'canvas', id: 'cover', background: '#ffffff', elements: [] },
      { kind: 'calendar', id: 'cal' },
      { kind: 'canvas', id: 'tips', background: '#ffffff', elements: [] },
    ])
    expect(pagesOf(trois, ctx(), calendar).map((p) => p.key)).toEqual([
      'cover',
      'cal',
      'tips',
    ])
  })

  it('porte le fond de la page sur la Page rendue', () => {
    const colore = design([
      { kind: 'canvas', id: 'p1', background: '#fce7f3', elements: [] },
    ])
    expect(sonde(pagesOf(colore, ctx(), calendar)[0]).props.style).toMatchObject({
      backgroundColor: '#fce7f3',
    })
  })
})
