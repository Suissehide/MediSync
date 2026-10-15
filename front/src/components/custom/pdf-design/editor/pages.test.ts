import { describe, expect, it } from 'vitest'

import type { PdfPage } from '../../../../types/pdfDesign.ts'
import {
  ajouterPage,
  aUnCalendrier,
  deplacerPage,
  pageCalendrier,
  pageVierge,
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
