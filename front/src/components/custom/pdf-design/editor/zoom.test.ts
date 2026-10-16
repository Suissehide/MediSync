import { describe, expect, it } from 'vitest'

import { palierSuivant } from './zoom.ts'

describe('palierSuivant', () => {
  it('monte au palier suivant', () => {
    expect(palierSuivant(1, 1)).toBe(1.5)
  })

  it('descend au palier precedent', () => {
    expect(palierSuivant(1, -1)).toBe(0.75)
  })

  // L'echelle ajustee depend de la fenetre : elle tombe presque toujours entre deux paliers,
  // et c'est le cas qui compte vraiment.
  it('rejoint le palier encadrant depuis une echelle quelconque', () => {
    expect(palierSuivant(0.63, 1)).toBe(0.75)
    expect(palierSuivant(0.63, -1)).toBe(0.5)
  })

  // Sans marge d'arrondi, un palier atteint par calcul se rendrait lui-meme.
  it('ne reste pas colle au palier dont on part', () => {
    expect(palierSuivant(0.7500000001, 1)).toBe(1)
    expect(palierSuivant(0.7499999999, -1)).toBe(0.5)
  })

  it('ne bouge plus aux extremites', () => {
    expect(palierSuivant(2, 1)).toBe(2)
    expect(palierSuivant(0.25, -1)).toBe(0.25)
  })
})
