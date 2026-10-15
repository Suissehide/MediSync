import { describe, expect, it } from 'vitest'

import { A4_WIDTH } from '../../../../types/pdfDesign.ts'
import { dupliquerElement, nouvelElement } from './elements.ts'

describe('nouvelElement', () => {
  it('pose un texte au centre horizontal de la page', () => {
    const e = nouvelElement('text')
    expect(e.x + e.w / 2).toBeCloseTo(A4_WIDTH / 2, 5)
  })

  it('donne un identifiant unique a chaque appel', () => {
    expect(nouvelElement('text').id).not.toBe(nouvelElement('text').id)
  })

  it('cree un texte avec un run lisible, jamais vide', () => {
    const e = nouvelElement('text')
    if (e.kind !== 'text') {
      throw new Error('forme inattendue')
    }
    // Le schema refuse `runs: []`, et un texte vide serait invisible sur la toile.
    expect(e.runs.length).toBeGreaterThan(0)
  })

  it('cree un rect avec un rayon nul, que le moteur sait ne pas emettre', () => {
    const e = nouvelElement('rect')
    if (e.kind !== 'rect') {
      throw new Error('forme inattendue')
    }
    expect(e.radius).toBe(0)
  })

  it('cree une image sur une source livree', () => {
    const e = nouvelElement('image')
    if (e.kind !== 'image') {
      throw new Error('forme inattendue')
    }
    expect(e.source).toEqual({ builtin: 'logo-chu' })
  })
})

describe('dupliquerElement', () => {
  it('decale la copie pour qu elle ne se cache pas sous l original', () => {
    const original = nouvelElement('rect')
    const copie = dupliquerElement(original)
    expect(copie.x).toBe(original.x + 10)
    expect(copie.y).toBe(original.y + 10)
  })

  it('donne un identifiant neuf a la copie', () => {
    const original = nouvelElement('rect')
    expect(dupliquerElement(original).id).not.toBe(original.id)
  })

  // Une copie qui partagerait le tableau de runs ferait suivre chaque frappe sur l'original.
  it('ne partage pas les runs avec l original', () => {
    const original = nouvelElement('text')
    const copie = dupliquerElement(original)
    if (original.kind !== 'text' || copie.kind !== 'text') {
      throw new Error('forme inattendue')
    }
    expect(copie.runs).not.toBe(original.runs)
  })
})
