import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PdfDesignContent } from '../../../../types/pdfDesign.ts'
import { useEdition } from './use-edition.ts'

const CONTENU: PdfDesignContent = {
  version: 1,
  pages: [
    {
      kind: 'canvas',
      id: 'cover',
      background: '#ffffff',
      elements: [
        {
          id: 'titre',
          kind: 'rect',
          x: 10,
          y: 20,
          w: 100,
          h: 30,
          rotation: 0,
          fill: '#e05a5a',
          radius: 0,
        },
      ],
    },
    { kind: 'calendar', id: 'calendrier' },
    { kind: 'canvas', id: 'tips', background: '#ffffff', elements: [] },
  ],
}

describe('useEdition', () => {
  it('ouvre sur la premiere page composable, pas sur le calendrier', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    expect(result.current.pageCourante?.id).toBe('cover')
  })

  it('ne propose a l edition que les pages composables', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    expect(result.current.pagesEditables.map((p) => p.id)).toEqual([
      'cover',
      'tips',
    ])
  })

  it('change de page', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirPage('tips'))
    expect(result.current.pageCourante?.id).toBe('tips')
  })

  it('deselectionne en changeant de page, sinon l inspecteur montre un element absent', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirElement('titre'))
    act(() => result.current.choisirPage('tips'))
    expect(result.current.selection).toBeNull()
  })

  it('modifie un element de la page courante', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.modifierElement('titre', { x: 42 }))
    const page = result.current.contenu.pages[0]
    if (page.kind !== 'canvas') {
      throw new Error('forme inattendue')
    }
    expect(page.elements[0]).toMatchObject({ x: 42, y: 20 })
  })

  it('ne touche pas au contenu d origine', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.modifierElement('titre', { x: 42 }))
    const origine = CONTENU.pages[0]
    if (origine.kind !== 'canvas') {
      throw new Error('forme inattendue')
    }
    expect(origine.elements[0]?.x).toBe(10)
  })

  it('signale qu il y a des modifications non enregistrees', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    expect(result.current.modifie).toBe(false)
    act(() => result.current.modifierElement('titre', { x: 42 }))
    expect(result.current.modifie).toBe(true)
  })

  it('retombe a non modifie apres un enregistrement', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.modifierElement('titre', { x: 42 }))
    act(() => result.current.marquerEnregistre())
    expect(result.current.modifie).toBe(false)
  })

  // Le contenu arrive apres le premier rendu (la requete repond en second) : sans cela
  // l'editeur resterait sur le contenu vide de son montage, sans rien dire.
  it('prend le contenu qui arrive apres le premier rendu', () => {
    const vide: PdfDesignContent = { version: 1, pages: [] }
    const { result, rerender } = renderHook(
      ({ c }: { c: PdfDesignContent }) => useEdition(c),
      { initialProps: { c: vide } },
    )
    expect(result.current.pageCourante).toBeNull()

    rerender({ c: CONTENU })

    expect(result.current.pageCourante?.id).toBe('cover')
    expect(result.current.modifie).toBe(false)
  })

  // Le point d'entree unique de l'historique (tache 8) : tout passe par la, y compris un
  // remplacement complet, qui ne doit pas passer pour « deja enregistre ».
  it('marque modifie apres un remplacement complet du contenu', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() =>
      result.current.remplacerContenu({ version: 1, pages: CONTENU.pages }),
    )
    expect(result.current.modifie).toBe(true)
  })
})

// Les operations de LISTE : elles touchent `page.elements`, pas un element. Elles passent par
// le meme point d'entree interne que `modifierElement`, auquel l'historique se branchera.
describe('useEdition, operations de liste', () => {
  const elementsDe = (contenu: PdfDesignContent, rang = 0) => {
    const page = contenu.pages[rang]
    if (page?.kind !== 'canvas') {
      throw new Error('forme inattendue')
    }
    return page.elements
  }

  it('ajoute un element a la page courante et le selectionne', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.ajouterElement('text'))
    expect(elementsDe(result.current.contenu)).toHaveLength(2)
    expect(result.current.selection).toBe(
      elementsDe(result.current.contenu)[1]?.id,
    )
  })

  it('ajoute sur la page courante, pas sur la premiere', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirPage('tips'))
    act(() => result.current.ajouterElement('rect'))
    expect(elementsDe(result.current.contenu, 2)).toHaveLength(1)
    expect(elementsDe(result.current.contenu, 0)).toHaveLength(1)
  })

  it('supprime l element selectionne et vide la selection', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirElement('titre'))
    act(() => result.current.supprimerSelection())
    expect(elementsDe(result.current.contenu)).toHaveLength(0)
    expect(result.current.selection).toBeNull()
  })

  it('duplique l element selectionne et selectionne la copie', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirElement('titre'))
    act(() => result.current.dupliquerSelection())
    const elements = elementsDe(result.current.contenu)
    expect(elements).toHaveLength(2)
    expect(result.current.selection).toBe(elements[1]?.id)
    expect(elements[1]?.id).not.toBe('titre')
  })

  // L'ordre du tableau EST l'ordre de peinture : passer au premier plan, c'est aller en fin.
  it('met l element selectionne au premier plan, donc en fin de tableau', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirElement('titre'))
    act(() => result.current.dupliquerSelection())
    act(() => result.current.choisirElement('titre'))
    act(() => result.current.changerOrdre('avant'))
    expect(elementsDe(result.current.contenu)[1]?.id).toBe('titre')
  })

  it('met l element selectionne en arriere-plan, donc en tete de tableau', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirElement('titre'))
    act(() => result.current.dupliquerSelection())
    act(() => result.current.changerOrdre('arriere'))
    const elements = elementsDe(result.current.contenu)
    expect(elements[0]?.id).toBe(result.current.selection)
    expect(elements[1]?.id).toBe('titre')
  })

  it('ne fait rien quand aucun element n est selectionne', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.supprimerSelection())
    expect(elementsDe(result.current.contenu)).toHaveLength(1)
    expect(result.current.modifie).toBe(false)
  })
})
