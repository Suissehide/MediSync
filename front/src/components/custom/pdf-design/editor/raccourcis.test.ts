import { describe, expect, it } from 'vitest'

import { actionDuClavier, type ToucheClavier } from './raccourcis.ts'

const touche = (over: Partial<ToucheClavier> = {}): ToucheClavier => ({
  key: 'a',
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  dansUnChamp: false,
  ...over,
})

describe('actionDuClavier', () => {
  // Sans cela, taper « z » dans un champ de l'inspecteur annulerait le geste precedent.
  it('ne rend rien quand la frappe vient d un champ de saisie', () => {
    expect(
      actionDuClavier(touche({ key: 'z', metaKey: true, dansUnChamp: true })),
    ).toBeNull()
  })

  it('annule sur cmd+z et sur ctrl+z', () => {
    expect(actionDuClavier(touche({ key: 'z', metaKey: true }))).toEqual({
      type: 'annuler',
    })
    expect(actionDuClavier(touche({ key: 'Z', ctrlKey: true }))).toEqual({
      type: 'annuler',
    })
  })

  it('retablit sur cmd+maj+z', () => {
    expect(
      actionDuClavier(touche({ key: 'z', metaKey: true, shiftKey: true })),
    ).toEqual({ type: 'retablir' })
  })

  it('deselectionne sur Echap', () => {
    expect(actionDuClavier(touche({ key: 'Escape' }))).toEqual({
      type: 'deselectionner',
    })
  })

  it('supprime sur Suppr et sur Retour arriere', () => {
    expect(actionDuClavier(touche({ key: 'Delete' }))).toEqual({
      type: 'supprimer',
    })
    expect(actionDuClavier(touche({ key: 'Backspace' }))).toEqual({
      type: 'supprimer',
    })
  })

  it('deplace d un point par les fleches', () => {
    expect(actionDuClavier(touche({ key: 'ArrowLeft' }))).toEqual({
      type: 'deplacer',
      dx: -1,
      dy: 0,
    })
    expect(actionDuClavier(touche({ key: 'ArrowDown' }))).toEqual({
      type: 'deplacer',
      dx: 0,
      dy: 1,
    })
  })

  it('deplace de dix points avec Maj', () => {
    expect(
      actionDuClavier(touche({ key: 'ArrowRight', shiftKey: true })),
    ).toEqual({ type: 'deplacer', dx: 10, dy: 0 })
  })

  it('ne rend rien pour une touche sans role', () => {
    expect(actionDuClavier(touche({ key: 'q' }))).toBeNull()
  })
})
