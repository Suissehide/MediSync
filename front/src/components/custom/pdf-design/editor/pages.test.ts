import { describe, expect, it } from 'vitest'

import type { PdfPage } from '../../../../types/pdfDesign.ts'
import {
  ajouterPage,
  aUnCalendrier,
  copieDePage,
  deplacerPage,
  insererApres,
  nomsDePages,
  pageCalendrier,
  pageVierge,
  reordonnerPages,
  supprimerPage,
} from './pages.ts'

const toile = (id: string): PdfPage => ({
  kind: 'canvas',
  id,
  background: '#ffffff',
  elements: [],
})
const calendrier = (id: string): PdfPage => ({ kind: 'calendar', id })

describe('pageVierge', () => {
  it('rend une toile blanche et vide', () => {
    const p = pageVierge()
    expect(p.kind).toBe('canvas')
    expect(p.elements).toEqual([])
    expect(p.background).toBe('#ffffff')
  })

  it('donne un identifiant unique a chaque appel', () => {
    expect(pageVierge().id).not.toBe(pageVierge().id)
  })
})

describe('pageCalendrier', () => {
  it('rend une page calendrier', () => {
    expect(pageCalendrier().kind).toBe('calendar')
  })

  it('donne un identifiant unique a chaque appel', () => {
    expect(pageCalendrier().id).not.toBe(pageCalendrier().id)
  })
})

describe('aUnCalendrier', () => {
  it('voit la page calendrier', () => {
    expect(aUnCalendrier([toile('a'), calendrier('c')])).toBe(true)
  })

  it('ne la voit pas quand il n y en a pas', () => {
    expect(aUnCalendrier([toile('a')])).toBe(false)
  })
})

describe('ajouterPage', () => {
  it('ajoute a la fin', () => {
    const r = ajouterPage([toile('a')], pageVierge())
    expect(r).toHaveLength(2)
    expect(r[0]?.id).toBe('a')
  })

  it('ne touche pas le tableau d origine', () => {
    const depart = [toile('a')]
    ajouterPage(depart, pageVierge())
    expect(depart).toHaveLength(1)
  })
})

describe('supprimerPage', () => {
  it('retire la page nommee', () => {
    const r = supprimerPage([toile('a'), toile('b')], 'a')
    expect(r.map((p) => p.id)).toEqual(['b'])
  })

  // Review Focus 2 : le schema exige au moins une page. Supprimer la derniere ne doit pas
  // produire un contenu que l'enregistrement refusera.
  it('refuse de retirer la derniere page', () => {
    const depart = [toile('a')]
    expect(supprimerPage(depart, 'a')).toEqual(depart)
  })

  it('ignore un identifiant inconnu', () => {
    const depart = [toile('a'), toile('b')]
    expect(supprimerPage(depart, 'absente')).toEqual(depart)
  })
})

describe('deplacerPage', () => {
  it('avance une page d un rang', () => {
    const r = deplacerPage([toile('a'), toile('b'), toile('c')], 'c', 'avant')
    expect(r.map((p) => p.id)).toEqual(['a', 'c', 'b'])
  })

  it('recule une page d un rang', () => {
    const r = deplacerPage([toile('a'), toile('b'), toile('c')], 'a', 'arriere')
    expect(r.map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })

  it('ne fait rien sur la premiere page qu on avance', () => {
    const depart = [toile('a'), toile('b')]
    expect(deplacerPage(depart, 'a', 'avant')).toEqual(depart)
  })

  it('ne fait rien sur la derniere page qu on recule', () => {
    const depart = [toile('a'), toile('b')]
    expect(deplacerPage(depart, 'b', 'arriere')).toEqual(depart)
  })

  it('ignore un identifiant inconnu', () => {
    const depart = [toile('a'), toile('b')]
    expect(deplacerPage(depart, 'absente', 'avant')).toEqual(depart)
  })
})

describe('nomsDePages', () => {
  // Les toiles se numerotent ENTRE ELLES : le calendrier au milieu ne doit pas faire sauter
  // la couverture de « Page 1 » a « Page 2 ».
  it('nomme le calendrier et numerote les toiles entre elles', () => {
    expect(nomsDePages([toile('a'), calendrier('c'), toile('b')])).toEqual([
      'Page 1',
      'Calendrier',
      'Page 2',
    ])
  })
})

describe('reordonnerPages', () => {
  const trois = [toile('a'), toile('b'), toile('c')]

  it('insere avant la page visee', () => {
    expect(reordonnerPages(trois, 'c', 1).map((p) => p.id)).toEqual([
      'a',
      'c',
      'b',
    ])
  })

  it('met en dernier avec un rang egal au nombre de pages', () => {
    expect(reordonnerPages(trois, 'a', 3).map((p) => p.id)).toEqual([
      'b',
      'c',
      'a',
    ])
  })

  // Les deux rangs qui ne changent RIEN, et que l'indicateur de depot n'affiche pas : sur
  // soi-meme, et juste apres soi.
  it('ne fait rien quand la position ne change pas', () => {
    expect(reordonnerPages(trois, 'b', 1)).toEqual(trois)
    expect(reordonnerPages(trois, 'b', 2)).toEqual(trois)
  })

  it('ignore un identifiant inconnu et un rang hors bornes', () => {
    expect(reordonnerPages(trois, 'absente', 1)).toEqual(trois)
    expect(reordonnerPages(trois, 'a', 9)).toEqual(trois)
  })
})

describe('copieDePage', () => {
  // Partager un identifiant entre deux pages ferait selectionner les deux boites a la fois,
  // et l'inspecteur modifierait celle qu'on ne voit pas.
  it('donne une identite neuve a la page et a chacun de ses elements', () => {
    const originale = {
      kind: 'canvas' as const,
      id: 'p1',
      background: '#ffffff',
      elements: [
        {
          id: 'e1',
          kind: 'rect' as const,
          x: 1,
          y: 2,
          w: 3,
          h: 4,
          rotation: 0,
          fill: '#000000',
          radius: 0,
        },
      ],
    }
    const copie = copieDePage(originale)
    expect(copie.id).not.toBe('p1')
    expect(copie.elements[0]?.id).not.toBe('e1')
    // La place, elle, ne bouge pas : decaler chaque element deplacerait tout le dessin.
    expect(copie.elements[0]?.x).toBe(1)
  })
})

describe('insererApres', () => {
  it('pose la page juste apres son original', () => {
    const r = insererApres([toile('a'), toile('b')], 'a', toile('neuve'))
    expect(r.map((p) => p.id)).toEqual(['a', 'neuve', 'b'])
  })

  it('ajoute a la fin quand l original a disparu', () => {
    const r = insererApres([toile('a')], 'absente', toile('neuve'))
    expect(r.map((p) => p.id)).toEqual(['a', 'neuve'])
  })
})
