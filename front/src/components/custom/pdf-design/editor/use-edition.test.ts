import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PdfDesignContent, PdfPage } from '../../../../types/pdfDesign.ts'
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

  // Etape 3 : la bande montre TOUTES les pages, calendrier compris — on le deplace et on le
  // supprime comme les autres, meme s'il ne se compose pas.
  it('propose TOUTES les pages, calendrier compris', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    expect(result.current.pages.map((p) => p.id)).toEqual([
      'cover',
      'calendrier',
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

  // Revue de branche, I1 : `marquerEnregistre` ne doit PAS declarer avoir vu le contenu
  // courant. L'invalidation de la requete arrive apres (`onSettled`), donc la source est
  // encore l'ancien objet du cache ; se dire a jour reveille la resynchronisation, et
  // l'editeur revient a la version d'avant l'enregistrement.
  it('ne revient pas a la version du serveur juste apres un enregistrement', () => {
    const { result, rerender } = renderHook(
      ({ c }: { c: PdfDesignContent }) => useEdition(c),
      { initialProps: { c: CONTENU } },
    )
    act(() => result.current.modifierElement('titre', { x: 42 }))
    act(() => result.current.marquerEnregistre())

    // Le cache n'a pas encore ete rafraichi : le rendu suivant repasse le MEME ancien objet.
    rerender({ c: CONTENU })

    const page = result.current.contenu.pages[0]
    if (page?.kind !== 'canvas') {
      throw new Error('forme inattendue')
    }
    expect(page.elements[0]?.x).toBe(42)
  })

  // Revue de branche, I5 : le Ruling 11 affirmait que la garde `!modifie` etait couverte.
  // Elle ne l'etait pas — aucun test n'exercait une resynchronisation AVEC du travail en
  // cours. La voici.
  it('ne jette pas un travail en cours quand la source change', () => {
    const autre: PdfDesignContent = { version: 1, pages: CONTENU.pages }
    const { result, rerender } = renderHook(
      ({ c }: { c: PdfDesignContent }) => useEdition(c),
      { initialProps: { c: CONTENU } },
    )
    act(() => result.current.modifierElement('titre', { x: 99 }))

    rerender({ c: autre })

    const page = result.current.contenu.pages[0]
    if (page?.kind !== 'canvas') {
      throw new Error('forme inattendue')
    }
    expect(page.elements[0]?.x).toBe(99)
    expect(result.current.modifie).toBe(true)
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

describe('useEdition, operations sur les pages', () => {
  it('ajoute une toile a la fin et s y place', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.ajouterToile())
    expect(result.current.pages).toHaveLength(4)
    expect(result.current.pageCourante?.id).toBe(result.current.pages[3]?.id)
  })

  it('ajoute la page calendrier quand il n y en a pas', () => {
    const sansCalendrier: PdfDesignContent = {
      version: 1,
      pages: [CONTENU.pages[0] as PdfPage],
    }
    const { result } = renderHook(() => useEdition(sansCalendrier))
    expect(result.current.peutAjouterCalendrier).toBe(true)
    act(() => result.current.ajouterCalendrier())
    expect(result.current.pages.map((p) => p.kind)).toEqual([
      'canvas',
      'calendar',
    ])
  })

  // Review Focus 3 : deux calendriers repeteraient le meme planning.
  it('ne propose pas une seconde page calendrier', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    expect(result.current.peutAjouterCalendrier).toBe(false)
    act(() => result.current.ajouterCalendrier())
    expect(result.current.pages).toHaveLength(3)
  })

  it('supprime une page', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.supprimerPage('tips'))
    expect(result.current.pages.map((p) => p.id)).toEqual([
      'cover',
      'calendrier',
    ])
  })

  // Review Focus 1 : la page courante disparait sous les pieds de l'editeur.
  it('se replace sur une page existante quand on supprime la courante', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirPage('tips'))
    act(() => result.current.supprimerPage('tips'))
    expect(result.current.pageCourante?.id).toBe('cover')
    expect(result.current.pages.some((p) => p.id === 'tips')).toBe(false)
  })

  // Review Focus 2 : le schema exige au moins une page.
  it('refuse de supprimer la derniere page', () => {
    const uneSeule: PdfDesignContent = {
      version: 1,
      pages: [CONTENU.pages[0] as PdfPage],
    }
    const { result } = renderHook(() => useEdition(uneSeule))
    act(() => result.current.supprimerPage(result.current.pages[0]?.id ?? ''))
    expect(result.current.pages).toHaveLength(1)
    expect(result.current.modifie).toBe(false)
  })

  it('deplace une page dans la bande', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.deplacerPage('tips', 'avant'))
    expect(result.current.pages.map((p) => p.id)).toEqual([
      'cover',
      'tips',
      'calendrier',
    ])
  })

  // Review Focus 4 : l'element selectionne appartient a sa page, pas a son rang.
  it('garde l element selectionne quand sa page change de rang', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirElement('titre'))
    act(() => result.current.deplacerPage('cover', 'arriere'))
    expect(result.current.selection).toBe('titre')
    expect(result.current.pageCourante?.id).toBe('cover')
  })

  // Revue de branche, I1 : le cas ci-dessus etait vrai par vacuite. Il deplace « cover »
  // derriere le CALENDRIER, donc `premiereToile` la retrouve quand meme. Le cas vraiment
  // atteignable est celui-ci : une AUTRE toile passe devant la page affichee, sans qu'on ait
  // jamais clique dans la bande — `pageId` vaut alors `null` et rien n'epingle la page
  // courante implicite.
  it('reste sur la page affichee quand une autre toile passe devant', () => {
    // Deux toiles ADJACENTES : avec le calendrier entre les deux, `premiereToile`
    // retrouverait « cover » par accident et le test ne prouverait rien.
    const deuxToiles: PdfDesignContent = {
      version: 1,
      pages: [
        CONTENU.pages[0] as PdfPage,
        { kind: 'canvas', id: 'tips', background: '#ffffff', elements: [] },
      ],
    }
    const { result } = renderHook(() => useEdition(deuxToiles))
    act(() => result.current.choisirElement('titre'))

    act(() => result.current.deplacerPage('tips', 'avant'))

    expect(result.current.pageCourante?.id).toBe('cover')
    expect(result.current.selection).toBe('titre')
  })

  // Meme racine : `supprimerUnePage` comparait a `pageId`, nul tant qu'on n'a pas clique.
  // Supprimer la page implicitement affichee laissait donc une selection orpheline.
  it('vide la selection en supprimant la page affichee sans clic prealable', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirElement('titre'))

    act(() => result.current.supprimerPage('cover'))

    expect(result.current.selection).toBeNull()
  })

  // Review Focus 5 : il n'y a aucune toile sur laquelle ouvrir. Le hook doit quand meme
  // designer une page courante, sinon l'ecran n'a rien a afficher et ne sait pas pourquoi.
  it('ouvre sur le calendrier quand c est la seule page', () => {
    const calendrierSeul: PdfDesignContent = {
      version: 1,
      pages: [{ kind: 'calendar', id: 'calendrier' }],
    }
    const { result } = renderHook(() => useEdition(calendrierSeul))
    expect(result.current.pageCourante?.id).toBe('calendrier')
    expect(result.current.pageCourante?.kind).toBe('calendar')
  })
})
