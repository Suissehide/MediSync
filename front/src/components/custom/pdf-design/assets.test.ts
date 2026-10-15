import { describe, expect, it } from 'vitest'

import type { PdfDesignContent } from '../../../types/pdfDesign.ts'
import { assetIdsDe } from './assets.ts'

const avecImage = (source: unknown): PdfDesignContent =>
  ({
    version: 1,
    pages: [
      {
        kind: 'canvas',
        id: 'p1',
        background: '#ffffff',
        elements: [
          {
            id: 'img',
            kind: 'image',
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            rotation: 0,
            source,
            fit: 'contain',
          },
        ],
      },
    ],
  }) as PdfDesignContent

describe('assetIdsDe', () => {
  it('rend les identifiants des images deposees', () => {
    expect(assetIdsDe(avecImage({ assetId: 'a1' }))).toEqual(['a1'])
  })

  // Une image livree est embarquee dans le bundle : rien a telecharger.
  it('ignore les images livrees', () => {
    expect(assetIdsDe(avecImage({ builtin: 'logo-chu' }))).toEqual([])
  })

  // Sinon la meme image serait demandee deux fois au serveur.
  it('ne rend qu une fois un identifiant utilise deux fois', () => {
    const deux = avecImage({ assetId: 'a1' })
    const page = deux.pages[0]
    if (page?.kind !== 'canvas') {
      throw new Error('forme inattendue')
    }
    page.elements.push({ ...page.elements[0], id: 'img2' })
    expect(assetIdsDe(deux)).toEqual(['a1'])
  })

  it('rend un tableau vide sur un design sans image', () => {
    expect(
      assetIdsDe({
        version: 1,
        pages: [
          { kind: 'canvas', id: 'p1', background: '#ffffff', elements: [] },
        ],
      }),
    ).toEqual([])
  })

  // La page calendrier ne porte pas d'elements : la traverser ne doit pas jeter.
  it('traverse une page calendrier', () => {
    const contenu = avecImage({ assetId: 'a1' })
    contenu.pages.unshift({ kind: 'calendar', id: 'c1' })
    expect(assetIdsDe(contenu)).toEqual(['a1'])
  })
})
