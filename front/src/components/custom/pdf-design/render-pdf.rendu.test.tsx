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
})
