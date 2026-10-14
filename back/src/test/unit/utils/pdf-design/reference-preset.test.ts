import { pdfDesignContentSchema } from '../../../../main/interfaces/http/fastify/schemas/pdf-design-content.schema'
import {
  REFERENCE_PRESET_CONTENT,
  REFERENCE_PRESET_ID,
  REFERENCE_PRESET_NAME,
} from '../../../../main/utils/pdf-design/reference-preset'

const PAGE_W = 595.28
const PAGE_H = 841.89

// On epingle la forme PARSEE, pas le litteral : c'est celle que le front recoit, et la
// traverser prouve du meme coup que le preset passe la validation.
const PARSED = pdfDesignContentSchema.parse(REFERENCE_PRESET_CONTENT)

const canvas = (index: number) => {
  const page = PARSED.pages[index]
  if (page.kind !== 'canvas') {
    throw new Error(`la page ${index} n'est pas une toile`)
  }
  return page
}

const element = (pageIndex: number, id: string) => {
  const found = canvas(pageIndex).elements.find((e) => e.id === id)
  if (!found) {
    throw new Error(`element ${id} absent de la page ${pageIndex}`)
  }
  return found
}

const texte = (pageIndex: number, id: string) => {
  const found = element(pageIndex, id)
  if (found.kind !== 'text') {
    throw new Error(`element ${id} n'est pas un texte`)
  }
  return found
}

describe('preset de reference', () => {
  it('passe le schema de contenu', () => {
    expect(() =>
      pdfDesignContentSchema.parse(REFERENCE_PRESET_CONTENT),
    ).not.toThrow()
  })

  it('porte un identifiant et un nom stables, dont depend le seed', () => {
    expect(REFERENCE_PRESET_ID).toBe('preset-smcv-reference')
    expect(REFERENCE_PRESET_NAME).toBe('Programme SMCV')
  })

  it('enchaine couverture, calendrier, conseils', () => {
    expect(PARSED.pages.map((p) => p.kind)).toEqual([
      'canvas',
      'calendar',
      'canvas',
    ])
  })

  // Epinglage : une retouche ulterieure ne peut pas deplacer le titre en silence.
  it('garde le titre de couverture a sa place et a sa taille', () => {
    const titre = texte(0, 'cover-title')
    expect(titre.runs).toEqual([{ text: 'SMCV', bold: false, italic: false }])
    expect(titre.fontSize).toBe(72)
    expect(titre.color).toBe('#e05a5a')
    expect(titre.align).toBe('center')
    // Releve au point pres sur le rendu d'origine (tache 9), pas estime.
    expect(titre.y).toBe(342)
  })

  it('garde le filet sous le titre, centre et de 4 points', () => {
    const filet = element(0, 'cover-underline')
    expect(filet.kind).toBe('rect')
    expect(filet.w).toBe(120)
    expect(filet.h).toBe(4)
    expect(filet.x).toBeCloseTo((PAGE_W - 120) / 2, 2)
  })

  it('garde le rond colore par le parcours, avec le repli mauve', () => {
    const rond = element(0, 'cover-circle')
    if (rond.kind !== 'ellipse') {
      throw new Error('forme inattendue')
    }
    expect(rond.fill).toEqual({ token: 'pathway.color', fallback: '#e6aff6' })
    expect(rond.w).toBe(380)
    expect(rond.h).toBe(380)
  })

  it('garde le logo en haut a gauche, a son rapport mesure', () => {
    const logo = element(0, 'cover-logo')
    if (logo.kind !== 'image') {
      throw new Error('forme inattendue')
    }
    expect(logo.source).toEqual({ builtin: 'logo-chu' })
    expect(logo.x).toBe(36)
    expect(logo.y).toBe(36)
    expect(logo.w).toBe(140)
    // 799 x 410 : la hauteur suit la largeur, comme le `height: auto` d'aujourd'hui.
    expect(logo.h).toBeCloseTo(140 / 1.9488, 2)
  })

  it('ancre le nom du patient en bas de sa boite', () => {
    const nom = texte(0, 'cover-patient')
    expect(nom.runs).toEqual([
      { field: 'patient.name', bold: false, italic: false },
    ])
    expect(nom.vAlign).toBe('bottom')
    expect(nom.fontSize).toBe(32)
    // bottom: 48 aujourd'hui -> le bas de la boite tombe a 841.89 - 48.
    expect(nom.y + nom.h).toBeCloseTo(PAGE_H - 48, 2)
  })

  it('porte le sous-titre du parcours et les dates du programme', () => {
    expect(texte(0, 'cover-program').runs).toEqual([
      { field: 'pathway.name', bold: false, italic: false },
    ])
    expect(texte(0, 'cover-dates').runs).toEqual([
      { field: 'program.dates', bold: false, italic: false },
    ])
  })

  it('porte les quatre conseils, chacun avec son pave, sa puce, son titre et son texte', () => {
    const ids = canvas(2).elements.map((e) => e.id)
    for (const n of [1, 2, 3, 4]) {
      expect(ids).toContain(`tip-${n}-box`)
      expect(ids).toContain(`tip-${n}-dot`)
      expect(ids).toContain(`tip-${n}-title`)
      expect(ids).toContain(`tip-${n}-body`)
    }
  })

  it('aligne le texte d un conseil apres sa puce', () => {
    const pave = element(2, 'tip-1-box')
    const puce = element(2, 'tip-1-dot')
    const corps = texte(2, 'tip-1-body')
    // padding 12 du pave, puis la puce de 10 et sa marge de 10.
    expect(puce.x).toBe(pave.x + 12)
    expect(corps.x).toBe(pave.x + 32)
    expect(corps.w).toBe(pave.w - 44)
  })

  it('garde l encadre de fin en un seul paragraphe, gras puis normal', () => {
    const banniere = texte(2, 'closing-text')
    expect(banniere.runs).toHaveLength(2)
    expect(banniere.runs[0]).toMatchObject({ bold: true })
    expect(banniere.runs[1]).toMatchObject({ bold: false })
  })

  it('garde le numero du service en gras, dans la phrase de contact', () => {
    const contact = texte(2, 'closing-contact')
    expect(contact.runs.at(-1)).toEqual({
      text: '05 57 62 32 91',
      bold: true,
      italic: false,
    })
  })

  // Rien ne sort de la page : une coordonnee negative n'est legitime que pour le decor,
  // qui depasse volontairement (le rond et les lignes en diagonale).
  it('ne laisse aucun texte sortir de la page', () => {
    for (const index of [0, 2]) {
      for (const e of canvas(index).elements) {
        if (e.kind !== 'text') {
          continue
        }
        expect(e.x).toBeGreaterThanOrEqual(0)
        expect(e.y).toBeGreaterThanOrEqual(0)
        expect(e.x + e.w).toBeLessThanOrEqual(PAGE_W + 0.01)
        expect(e.y + e.h).toBeLessThanOrEqual(PAGE_H + 0.01)
      }
    }
  })

  it('ne laisse aucun pave de conseil chevaucher le suivant', () => {
    const paves = [1, 2, 3, 4].map((n) => element(2, `tip-${n}-box`))
    for (const [index, pave] of paves.slice(0, -1).entries()) {
      expect(pave.y + pave.h).toBeLessThanOrEqual(paves[index + 1].y)
    }
    // Et le dernier ne mord pas sur l'encadre de fin.
    const dernier = paves[3]
    const encadre = element(2, 'closing-box')
    expect(dernier.y + dernier.h).toBeLessThanOrEqual(encadre.y)
  })
})
