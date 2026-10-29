// @vitest-environment node
// Sous jsdom, un Buffer n'est pas un Uint8Array du meme realm : pdfkit prendrait l'image pour un chemin.
import { Document, pdf } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'

import type { Patient } from '../../../types/patient.ts'
import {
  A4_HEIGHT,
  A4_WIDTH,
  type PdfDesignContent,
  type PdfElement,
  type PdfTextElement,
} from '../../../types/pdfDesign.ts'
import type { PdfFieldContext } from './fields.ts'
import { pagesOf } from './render-pdf.tsx'

// Les autres tests lisent l'arbre React, qui ne dit rien de la mise en page. Celui-ci fait
// tourner le VRAI moteur : trois defauts de cette famille — rayon nul refuse, boucle infinie
// sur un debordement, texte tronque — n'etaient visibles qu'ici.
//
// L'oracle est `_INTERNAL__LAYOUT__DATA_`, l'arbre MIS EN PAGE que react-pdf passe au
// `onRender` du Document : il porte les lignes reellement produites, apres cesure et apres
// troncature. Lire les octets du PDF ne marcherait pas, ils sont compresses. C'est une API
// interne, assumee : la seule alternative est d'embarquer un extracteur de PDF.
type NoeudMisEnPage = {
  type?: string
  lines?: { string?: string }[]
  children?: NoeudMisEnPage[]
}

// Combien de PAGES l'arbre mis en page porte reellement : une page sans element ne laisse
// aucune ligne, donc compter les lignes ne dit rien de son existence.
const nombreDePages = (noeud: NoeudMisEnPage | undefined): number => {
  if (!noeud) {
    return 0
  }
  const sienne = noeud.type === 'PAGE' ? 1 : 0
  return (
    sienne + (noeud.children ?? []).reduce((n, e) => n + nombreDePages(e), 0)
  )
}

// Combien de noeuds d'un type donne l'arbre mis en page porte. Pour une IMAGE, c'est la seule
// facon de distinguer « react-pdf a dessine l'image » de « il a journalise et saute » : il ne
// jette pas sur un `src` manquant, il produit le document sans elle.
const nombreDe = (type: string, noeud: NoeudMisEnPage | undefined): number => {
  if (!noeud) {
    return 0
  }
  const sien = noeud.type === type ? 1 : 0
  return (
    sien + (noeud.children ?? []).reduce((n, e) => n + nombreDe(type, e), 0)
  )
}

const lignesDe = (noeud: NoeudMisEnPage | undefined): string[] => {
  if (!noeud) {
    return []
  }
  const siennes = (noeud.lines ?? [])
    .map((l) => l.string ?? '')
    .filter((s) => s.length > 0)
  return [...siennes, ...(noeud.children ?? []).flatMap(lignesDe)]
}

const ctx = (over: Partial<PdfFieldContext> = {}): PdfFieldContext => ({
  patient: { id: 'p1', firstName: 'Jean', lastName: 'Dupont' } as Patient,
  pathways: [],
  upcomingSlots: [],
  serviceName: 'SMCV',
  ...over,
})

const rendre = async (elements: PdfElement[], c = ctx()): Promise<string[]> => {
  let miseEnPage: NoeudMisEnPage | undefined
  const pages: PdfDesignContent['pages'] = [
    { kind: 'canvas', id: 'p1', background: '#ffffff', elements },
  ]
  const flux = await pdf(
    <Document
      // `OnRenderProps` ne declare pas ce champ : il est interne, d'ou le cast explicite.
      onRender={(p) => {
        miseEnPage = (
          p as unknown as { _INTERNAL__LAYOUT__DATA_?: NoeudMisEnPage }
        )._INTERNAL__LAYOUT__DATA_
      }}
    >
      {pagesOf({ version: 1, pages }, c, {} as never)}
    </Document>,
  ).toBuffer()
  await new Promise((resolve, reject) => {
    flux.on('end', resolve).on('error', reject).resume()
  })
  return lignesDe(miseEnPage)
}

// Variante multi-pages : `rendre` n'en compose qu'une, et l'etape 3 fait du nombre de pages
// une donnee que le service manipule.
const rendreDocument = async (
  pages: PdfDesignContent['pages'],
  sources?: Record<string, string>,
): Promise<{ lignes: string[]; pages: number; images: number }> => {
  let miseEnPage: NoeudMisEnPage | undefined
  const flux = await pdf(
    <Document
      onRender={(p) => {
        miseEnPage = (
          p as unknown as { _INTERNAL__LAYOUT__DATA_?: NoeudMisEnPage }
        )._INTERNAL__LAYOUT__DATA_
      }}
    >
      {pagesOf({ version: 1, pages }, ctx(), {} as never, sources)}
    </Document>,
  ).toBuffer()
  await new Promise((resolve, reject) => {
    flux.on('end', resolve).on('error', reject).resume()
  })
  return {
    lignes: lignesDe(miseEnPage),
    pages: nombreDePages(miseEnPage),
    images: nombreDe('IMAGE', miseEnPage),
  }
}

const texte = (over: Partial<PdfTextElement>): PdfTextElement => ({
  id: 'txt',
  kind: 'text',
  x: 36,
  y: 100,
  w: A4_WIDTH - 72,
  h: 20,
  rotation: 0,
  runs: [{ text: 'Bonjour', bold: false, italic: false }],
  fontSize: 12,
  bold: false,
  italic: false,
  color: '#221755',
  align: 'left',
  vAlign: 'top',
  ...over,
})

// Un vrai PNG : 120x120 d'un vert franc. Le moteur decode reellement les octets, un base64
// invente ne donnerait pas de noeud IMAGE.
const CARRE_VERT =
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAIAAAC2BqGFAAAA60lEQVR4nO3QAQkAIADAMJvYy7RGs4XCHTzA2Zh76ULj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtzqJGso938rZ6QAAAABJRU5ErkJggg=='

describe('rendu reel', () => {
  // Le nom du patient tient sur deux lignes dans le preset. Un nom plus long en demandait
  // trois : react-pdf TRONQUAIT a la hauteur fixee et supprimait le prenom, remplace par une
  // ellipse. Perte de donnee silencieuse, sur l'identite du patient.
  it('ne mange aucun mot d un texte plus long que sa boite', async () => {
    const nom = texte({
      id: 'cover-patient',
      y: A4_HEIGHT - 48 - 78,
      h: 78,
      fontSize: 32,
      bold: true,
      vAlign: 'bottom',
      runs: [{ field: 'patient.name', bold: false, italic: false }],
    })
    const lignes = await rendre(
      [nom],
      ctx({
        patient: {
          id: 'p1',
          firstName: 'Jean-Baptiste Marie Alexandre',
          lastName: 'VANDENBOSSCHE-DELAROCHEFOUCAULD',
        } as Patient,
      }),
    )
    expect(lignes.join(' ')).toContain('Alexandre')
    expect(lignes.join('')).not.toContain('…')
  }, 30000)

  // Meme cause : une boite d'une seule ligne forcait une ligne unique, trop large, qui sortait
  // du bord droit au lieu de passer a la ligne.
  it('fait passer a la ligne au lieu de deborder du bord droit', async () => {
    const parcours = texte({
      id: 'cover-program',
      x: 0,
      y: 445,
      w: A4_WIDTH,
      h: 34,
      fontSize: 28,
      bold: true,
      align: 'center',
      runs: [{ field: 'pathway.name', bold: false, italic: false }],
    })
    const lignes = await rendre(
      [parcours],
      ctx({
        pathways: [
          {
            pathwayID: 'pw1',
            templateID: 't1',
            templateName:
              'Reeducation cardio-vasculaire et respiratoire renforcee',
            templateColor: null,
            templateMainTag: null,
            startDate: '2026-05-11T09:00:00.000Z',
            priority: null,
          },
        ],
      }),
    )
    expect(lignes.length).toBeGreaterThan(1)
    expect(lignes.join(' ')).toContain('renforcee')
  }, 30000)

  // react-pdf refuse `borderRadius: 0` : son resolveur jette sur la valeur resolue `undefined`.
  // Un filet EST un rect de rayon zero, donc tout le document tombait.
  it('rend un filet, c est-a-dire un rect de rayon zero', async () => {
    const filet: PdfElement = {
      id: 'filet',
      kind: 'rect',
      x: 237,
      y: 417,
      w: 120,
      h: 4,
      rotation: 0,
      fill: '#e05a5a',
      radius: 0,
    }
    await expect(rendre([filet, texte({})])).resolves.toContain('Bonjour')
  }, 30000)

  // Un element dont la boite finit sous le bas de la page faisait boucler react-pdf SANS FIN a
  // chercher une coupure. Si ce garde-fou casse, ce test PEND au lieu de rougir : c'est le prix
  // de couvrir un blocage synchrone, et c'est preferable a ne pas le couvrir.
  it('rend un decor qui deborde volontairement sous le bas de la page', async () => {
    const rond: PdfElement = {
      id: 'rond',
      kind: 'ellipse',
      x: -60,
      y: A4_HEIGHT + 180 - 380,
      w: 380,
      h: 380,
      rotation: 0,
      fill: { token: 'pathway.color', fallback: '#e6aff6' },
    }
    await expect(rendre([rond, texte({})])).resolves.toContain('Bonjour')
  }, 30000)

  // L'editeur de l'etape 2 rend ces positions atteignables d'un seul glissement : rien ne
  // borne la toile a la page, c'est le propre d'un canvas libre. Un design ainsi compose est
  // enregistre, puis rejoue a CHAQUE export du service — un blocage ici eteindrait le PDF
  // patient pour tout le monde, pas seulement pour qui l'a compose.
  it('rend un element entierement sous le bas de la page', async () => {
    const perdu: PdfElement = {
      id: 'perdu',
      kind: 'rect',
      x: 100,
      y: A4_HEIGHT + 200,
      w: 120,
      h: 40,
      rotation: 0,
      fill: '#e05a5a',
      radius: 0,
    }
    await expect(rendre([perdu, texte({})])).resolves.toContain('Bonjour')
  }, 30000)

  it('rend un element entierement a gauche de la page', async () => {
    const perdu: PdfElement = {
      id: 'perdu',
      kind: 'rect',
      x: -400,
      y: 100,
      w: 120,
      h: 40,
      rotation: 0,
      fill: '#e05a5a',
      radius: 0,
    }
    await expect(rendre([perdu, texte({})])).resolves.toContain('Bonjour')
  }, 30000)

  it('rend un texte plus large que la page', async () => {
    await expect(
      rendre([texte({ x: 40, y: 40, w: A4_WIDTH + 300, h: 60 })]),
    ).resolves.toContain('Bonjour')
  }, 30000)

  // Constat C1 de la revue de branche. Les trois cas ci-dessus ne debordaient que de 200 pt ;
  // au-dela de DEUX pages (1683,8 pt), react-pdf cherchait a nouveau une coupure sans fin.
  // Mesure avant le correctif : `y=800 h=1000` ne terminait pas en 40 s, `y=800 h=870` sortait
  // en 23 ms. L'editeur rend ces valeurs saisissables ET enregistrables, donc un seul design
  // eteignait l'export de tout le service.
  //
  // Comme les trois precedents, ces tests PENDENT au lieu de rougir si le garde-fou casse.
  it.each([
    ['sous deux pages, cas qui passait deja', 800, 870],
    ['au-dela de deux pages depuis le milieu', 800, 1000],
    ['au-dela de deux pages depuis le haut', 0, 1690],
    ['entierement sous la page', 5000, 400],
  ])(
    'rend une boite %s',
    async (_nom, y, h) => {
      const enorme: PdfElement = {
        id: 'enorme',
        kind: 'rect',
        x: 100,
        y,
        w: 120,
        h,
        rotation: 0,
        fill: '#e05a5a',
        radius: 0,
      }
      await expect(rendre([enorme, texte({})])).resolves.toContain('Bonjour')
    },
    40000,
  )

  // Etape 3 : le service ajoute des pages et les reordonne. Une page laissee VIDE doit
  // produire une page blanche, pas disparaitre du document ni faire echouer le rendu —
  // c'est le geste le plus banal de la bande, « Ajouter une page » puis on verra plus tard.
  it('rend un document dont une page est vide', async () => {
    const rendu = await rendreDocument([
      { kind: 'canvas', id: 'vide', background: '#ffffff', elements: [] },
      {
        kind: 'canvas',
        id: 'pleine',
        background: '#ffffff',
        elements: [texte({})],
      },
    ])
    // DEUX pages, pas seulement « le moteur ne leve pas » : une implementation qui laisserait
    // tomber les pages sans element resterait verte sur la seule assertion de contenu
    // (constat I2 de la revue de branche).
    expect(rendu.pages).toBe(2)
    expect(rendu.lignes).toContain('Bonjour')
  }, 30000)

  // Etape 4 : un design qui reference une image disparue (supprimee en base, ou venue d'un
  // autre service) sort quand meme, avec le reste de son contenu.
  //
  // CE QUE CE TEST NE PROUVE PAS, mesure plutot que supposee : la garde `if (!src)` de
  // `renderElement`. Sabotage fait — en la retirant, react-pdf journalise « Image should
  // receive either a "src" or "source" prop » et PRODUIT quand meme le document, donc ce test
  // reste vert. La garde elle-meme est tenue par « rend null pour une image deposee dont les
  // octets manquent » (render-pdf.test.tsx), qui rougit sous le meme sabotage. Celui-ci garde
  // sa valeur propre : il verifie sur le VRAI moteur qu'une image absente ne coute ni la page
  // ni le texte qui l'accompagne.
  it('rend un document dont une image deposee a disparu', async () => {
    const rendu = await rendreDocument([
      {
        kind: 'canvas',
        id: 'p1',
        background: '#ffffff',
        elements: [
          {
            id: 'fond',
            kind: 'image',
            x: 0,
            y: 0,
            w: A4_WIDTH,
            h: 200,
            rotation: 0,
            source: { assetId: 'disparue' },
            fit: 'cover',
          },
          texte({}),
        ],
      },
    ])
    expect(rendu.pages).toBe(1)
    expect(rendu.lignes).toContain('Bonjour')
    // ET aucune image dessinee : c'est la difference avec le cas d'a cote.
    expect(rendu.images).toBe(0)
  }, 30000)

  // Le pendant du precedent, et la preuve qui manquait : avec ses octets, l'image est
  // reellement DESSINEE par le vrai moteur. Sans cette assertion, les deux cas seraient
  // indiscernables — react-pdf ne jette pas sur un `src` manquant, il journalise et saute,
  // donc « le document sort » ne dit rien de l'image.
  it('dessine une image deposee quand ses octets sont fournis', async () => {
    const rendu = await rendreDocument(
      [
        {
          kind: 'canvas',
          id: 'p1',
          background: '#ffffff',
          elements: [
            {
              id: 'fond',
              kind: 'image',
              x: 0,
              y: 0,
              w: A4_WIDTH,
              h: 200,
              rotation: 0,
              source: { assetId: 'presente' },
              fit: 'cover',
            },
            texte({}),
          ],
        },
      ],
      { presente: `data:image/png;base64,${CARRE_VERT}` },
    )

    expect(rendu.pages).toBe(1)
    expect(rendu.images).toBe(1)
    expect(rendu.lignes).toContain('Bonjour')
  }, 30000)
})
