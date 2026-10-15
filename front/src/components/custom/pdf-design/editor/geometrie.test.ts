import { describe, expect, it } from 'vitest'

import { A4_WIDTH } from '../../../../types/pdfDesign.ts'
import {
  aimanter,
  type Boite,
  deplacer,
  redimensionner,
  TAILLE_MINIMALE,
} from './geometrie.ts'

const boite = (over: Partial<Boite> = {}): Boite => ({
  x: 100,
  y: 200,
  w: 80,
  h: 40,
  ...over,
})

describe('deplacer', () => {
  // Le delta est en pixels d'ecran ; la toile est rendue a l'echelle, donc il se divise.
  it('divise le delta par l echelle', () => {
    expect(deplacer(boite(), 50, 20, 0.5)).toMatchObject({ x: 200, y: 240 })
  })

  it('ne change ni la largeur ni la hauteur', () => {
    const r = deplacer(boite(), 13, 7, 1)
    expect(r.w).toBe(80)
    expect(r.h).toBe(40)
  })

  it('arrondit au point : un design ne porte pas de coordonnees a dix decimales', () => {
    expect(deplacer(boite(), 1, 1, 0.3)).toMatchObject({ x: 103, y: 203 })
  })
})

describe('redimensionner', () => {
  it('depuis le coin bas-droite, ne bouge que la taille', () => {
    expect(redimensionner(boite(), 'se', 20, 10, 1)).toEqual({
      x: 100,
      y: 200,
      w: 100,
      h: 50,
    })
  })

  // Le coin oppose reste fixe : tirer le coin haut-gauche deplace l'origine ET la taille.
  it('depuis le coin haut-gauche, bouge l origine et la taille en sens inverse', () => {
    expect(redimensionner(boite(), 'nw', 20, 10, 1)).toEqual({
      x: 120,
      y: 210,
      w: 60,
      h: 30,
    })
  })

  it('depuis un bord, ne touche qu un axe', () => {
    expect(redimensionner(boite(), 'e', 20, 999, 1)).toEqual({
      x: 100,
      y: 200,
      w: 100,
      h: 40,
    })
    expect(redimensionner(boite(), 'n', 999, 10, 1)).toEqual({
      x: 100,
      y: 210,
      w: 80,
      h: 30,
    })
  })

  it('tient compte de l echelle', () => {
    expect(redimensionner(boite(), 'se', 40, 20, 0.5)).toMatchObject({
      w: 160,
      h: 80,
    })
  })

  // Sans plancher, tirer trop loin retourne la boite : largeur negative, element invisible
  // et coordonnees absurdes enregistrees en base.
  it('ne retourne jamais la boite, meme en tirant tres loin', () => {
    const r = redimensionner(boite(), 'se', -500, -500, 1)
    expect(r.w).toBe(TAILLE_MINIMALE)
    expect(r.h).toBe(TAILLE_MINIMALE)
  })

  it('garde le bord oppose fixe quand le plancher est atteint depuis le haut-gauche', () => {
    const r = redimensionner(boite(), 'nw', 500, 500, 1)
    expect(r.w).toBe(TAILLE_MINIMALE)
    // bord droit d'origine : 100 + 80 = 180
    expect(r.x + r.w).toBe(180)
  })
})

describe('aimanter', () => {
  it('colle au bord gauche de la page', () => {
    expect(aimanter(boite({ x: 2 }), []).x).toBe(0)
  })

  // Revue de branche, minor 2 : l'aimantation rendait des coordonnees fractionnaires
  // (257,64) la ou `auPoint` existe justement pour n'en jamais ecrire. Le bord et l'axe sont
  // desormais rejoints au point pres — un demi-point d'ecart ne se voit pas, une coordonnee a
  // deux decimales dans le JSON se lit.
  it('colle au bord droit de la page, au point pres', () => {
    const b = boite({ x: A4_WIDTH - 80 - 3, w: 80 })
    expect(aimanter(b, []).x).toBe(Math.round(A4_WIDTH - 80))
  })

  it('colle a l axe median horizontal, au point pres', () => {
    const centre = (A4_WIDTH - 80) / 2
    expect(aimanter(boite({ x: centre + 2, w: 80 }), []).x).toBe(
      Math.round(centre),
    )
  })

  it('ne rend jamais de coordonnee fractionnaire', () => {
    const centre = (A4_WIDTH - 80) / 2
    const r = aimanter(boite({ x: centre + 2, w: 80, y: 3 }), [])
    expect(Number.isInteger(r.x)).toBe(true)
    expect(Number.isInteger(r.y)).toBe(true)
  })

  it('colle au bord d un voisin', () => {
    const voisin = boite({ x: 300, y: 0, w: 50, h: 10 })
    expect(aimanter(boite({ x: 302 }), [voisin]).x).toBe(300)
  })

  it('ne colle pas au-dela de la tolerance', () => {
    expect(aimanter(boite({ x: 40 }), []).x).toBe(40)
  })

  it('ne touche ni la largeur ni la hauteur', () => {
    const r = aimanter(boite({ x: 2 }), [])
    expect(r.w).toBe(80)
    expect(r.h).toBe(40)
  })
})
