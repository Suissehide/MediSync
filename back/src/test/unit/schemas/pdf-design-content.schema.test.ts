import { pdfDesignContentSchema } from '../../../main/interfaces/http/fastify/schemas/pdf-design-content.schema'

const pageAvecUnTexte = (element: unknown) => ({
  version: 1,
  pages: [
    { kind: 'canvas', id: 'p1', background: '#ffffff', elements: [element] },
  ],
})

const texte = {
  id: 'e1',
  kind: 'text',
  x: 0,
  y: 0,
  w: 100,
  h: 20,
  runs: [{ text: 'Bonjour' }],
  fontSize: 12,
  color: '#221755',
}

// Le narrowing de TypeScript ne traverse pas un acces indexe : on extrait l'element
// dans une locale avant de le restreindre.
const premierElement = (input: unknown) => {
  const page = pdfDesignContentSchema.parse(input).pages[0]
  if (page.kind !== 'canvas') {
    throw new Error('la premiere page n est pas une toile')
  }
  return page.elements[0]
}

describe('pdfDesignContentSchema', () => {
  it('accepte un design minimal', () => {
    const parsed = pdfDesignContentSchema.parse(pageAvecUnTexte(texte))
    expect(parsed.pages).toHaveLength(1)
  })

  it('applique les valeurs par defaut de style', () => {
    const element = premierElement(pageAvecUnTexte(texte))
    if (element.kind !== 'text') {
      throw new Error('forme inattendue')
    }
    expect(element.align).toBe('left')
    expect(element.vAlign).toBe('top')
    expect(element.bold).toBe(false)
    expect(element.italic).toBe(false)
    expect(element.rotation).toBe(0)
  })

  it('applique le fond blanc par defaut a une toile', () => {
    const parsed = pdfDesignContentSchema.parse({
      version: 1,
      pages: [{ kind: 'canvas', id: 'p1', elements: [] }],
    })
    const page = parsed.pages[0]
    if (page.kind !== 'canvas') {
      throw new Error('forme inattendue')
    }
    expect(page.background).toBe('#ffffff')
  })

  it('refuse un kind inconnu', () => {
    expect(() =>
      pdfDesignContentSchema.parse(
        pageAvecUnTexte({ ...texte, kind: 'qrcode' }),
      ),
    ).toThrow()
  })

  it('refuse une coordonnee manquante', () => {
    const { y: _y, ...sansY } = texte
    expect(() => pdfDesignContentSchema.parse(pageAvecUnTexte(sansY))).toThrow()
  })

  it('refuse une largeur nulle ou negative', () => {
    expect(() =>
      pdfDesignContentSchema.parse(pageAvecUnTexte({ ...texte, w: 0 })),
    ).toThrow()
  })

  it('refuse une couleur qui n est pas un hex a six chiffres', () => {
    expect(() =>
      pdfDesignContentSchema.parse(
        pageAvecUnTexte({ ...texte, color: 'rouge' }),
      ),
    ).toThrow()
  })

  it('refuse un texte sans aucun run', () => {
    expect(() =>
      pdfDesignContentSchema.parse(pageAvecUnTexte({ ...texte, runs: [] })),
    ).toThrow()
  })

  it('refuse un run qui porte a la fois du texte et une donnee', () => {
    expect(() =>
      pdfDesignContentSchema.parse(
        pageAvecUnTexte({
          ...texte,
          runs: [{ text: 'a', field: 'patient.name' }],
        }),
      ),
    ).toThrow()
  })

  it('accepte un run de donnee', () => {
    const element = premierElement(
      pageAvecUnTexte({
        ...texte,
        runs: [{ field: 'patient.name', bold: true }],
      }),
    )
    if (element.kind !== 'text') {
      throw new Error('forme inattendue')
    }
    expect(element.runs[0]).toEqual({
      field: 'patient.name',
      bold: true,
      italic: false,
    })
  })

  it('refuse une donnee inconnue', () => {
    expect(() =>
      pdfDesignContentSchema.parse(
        pageAvecUnTexte({ ...texte, runs: [{ field: 'patient.ssn' }] }),
      ),
    ).toThrow()
  })

  it('accepte un remplissage par jeton avec son repli', () => {
    const element = premierElement(
      pageAvecUnTexte({
        id: 'e2',
        kind: 'ellipse',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        fill: { token: 'pathway.color', fallback: '#e6aff6' },
      }),
    )
    expect(element.kind).toBe('ellipse')
  })

  it('refuse un jeton de remplissage sans repli', () => {
    expect(() =>
      pdfDesignContentSchema.parse(
        pageAvecUnTexte({
          id: 'e2',
          kind: 'ellipse',
          x: 0,
          y: 0,
          w: 10,
          h: 10,
          fill: { token: 'pathway.color' },
        }),
      ),
    ).toThrow()
  })

  it('refuse une image dont la source n est ni livree ni un asset', () => {
    expect(() =>
      pdfDesignContentSchema.parse(
        pageAvecUnTexte({
          id: 'e3',
          kind: 'image',
          x: 0,
          y: 0,
          w: 10,
          h: 10,
          source: { builtin: 'photo-de-vacances' },
        }),
      ),
    ).toThrow()
  })

  it('accepte une page calendrier, sans elements', () => {
    const parsed = pdfDesignContentSchema.parse({
      version: 1,
      pages: [{ kind: 'calendar', id: 'c1' }],
    })
    expect(parsed.pages[0].kind).toBe('calendar')
  })

  it('refuse un design sans aucune page', () => {
    expect(() =>
      pdfDesignContentSchema.parse({ version: 1, pages: [] }),
    ).toThrow()
  })

  it('refuse une version inconnue', () => {
    expect(() =>
      pdfDesignContentSchema.parse({
        version: 2,
        pages: [{ kind: 'calendar', id: 'c1' }],
      }),
    ).toThrow()
  })
})
