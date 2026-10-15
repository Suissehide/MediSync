import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PdfDesignContent } from '../../../../types/pdfDesign.ts'
import { LIMITE, REGROUPEMENT, useHistorique } from './use-historique.ts'

const etat = (marque: number): PdfDesignContent => ({
  version: 1,
  pages: [
    { kind: 'canvas', id: `p${marque}`, background: '#ffffff', elements: [] },
  ],
})

// `remplacerContenu` est la seule sortie de l'historique : on l'espionne plutot que de
// remonter tout l'editeur.
const monter = () => {
  const remplacer = vi.fn()
  const rendu = renderHook(() => useHistorique(remplacer))
  return { ...rendu, remplacer }
}

describe('useHistorique', () => {
  it('ne peut rien annuler au depart', () => {
    const { result } = monter()
    expect(result.current.peutAnnuler).toBe(false)
    expect(result.current.peutRetablir).toBe(false)
  })

  it('annule le dernier changement pousse', () => {
    const { result, remplacer } = monter()
    act(() => result.current.pousser(etat(1)))
    act(() => result.current.pousser(etat(2)))
    act(() => result.current.annuler())
    expect(remplacer).toHaveBeenLastCalledWith(etat(1))
  })

  it('retablit ce qui vient d etre annule', () => {
    const { result, remplacer } = monter()
    act(() => result.current.pousser(etat(1)))
    act(() => result.current.pousser(etat(2)))
    act(() => result.current.annuler())
    act(() => result.current.retablir())
    expect(remplacer).toHaveBeenLastCalledWith(etat(2))
  })

  // Sans cet oubli, « Retablir » ramenerait un etat qui n'a jamais suivi celui qu'on voit.
  it('oublie le futur des qu un nouveau changement est pousse', () => {
    const { result } = monter()
    act(() => result.current.pousser(etat(1)))
    act(() => result.current.pousser(etat(2)))
    act(() => result.current.annuler())
    act(() => result.current.pousser(etat(3)))
    expect(result.current.peutRetablir).toBe(false)
  })

  it('plafonne la pile et laisse tomber le plus ancien', () => {
    const { result, remplacer } = monter()
    for (let i = 0; i <= LIMITE + 5; i += 1) {
      act(() => result.current.pousser(etat(i)))
    }
    // On remonte toute la pile : le plus ancien atteignable n'est pas etat(0).
    for (let i = 0; i <= LIMITE + 5; i += 1) {
      act(() => result.current.annuler())
    }
    expect(remplacer).not.toHaveBeenCalledWith(etat(0))
    expect(result.current.peutAnnuler).toBe(false)
  })

  // Annuler puis annuler encore doit remonter d'un cran a chaque fois, pas rejouer le meme
  // etat : c'est le defaut classique d'un index mal avance.
  it('remonte d un cran par annulation', () => {
    const { result, remplacer } = monter()
    act(() => result.current.pousser(etat(1)))
    act(() => result.current.pousser(etat(2)))
    act(() => result.current.pousser(etat(3)))
    act(() => result.current.annuler())
    expect(remplacer).toHaveBeenLastCalledWith(etat(2))
    act(() => result.current.annuler())
    expect(remplacer).toHaveBeenLastCalledWith(etat(1))
  })

  it('ne fait rien quand il n y a plus rien a annuler', () => {
    const { result, remplacer } = monter()
    act(() => result.current.annuler())
    act(() => result.current.retablir())
    expect(remplacer).not.toHaveBeenCalled()
  })
})

// `synchroniser` est ce a quoi l'editeur se branche : il est appele a CHAQUE rendu, donc des
// dizaines de fois pendant un glissement. Sans regroupement, un seul geste remplirait la pile.
describe('useHistorique, synchronisation groupee', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retient le premier etat tout de suite, pour avoir ou revenir', () => {
    const { result } = monter()
    act(() => result.current.synchroniser(etat(1)))
    act(() => {
      vi.advanceTimersByTime(REGROUPEMENT + 10)
    })
    expect(result.current.peutAnnuler).toBe(false)
  })

  it('ne retient qu une entree pour une rafale de changements', () => {
    const { result, remplacer } = monter()
    act(() => result.current.synchroniser(etat(0)))
    act(() => {
      vi.advanceTimersByTime(REGROUPEMENT + 10)
    })
    for (let i = 1; i <= 20; i += 1) {
      act(() => result.current.synchroniser(etat(i)))
      act(() => {
        vi.advanceTimersByTime(10)
      })
    }
    act(() => {
      vi.advanceTimersByTime(REGROUPEMENT + 10)
    })

    act(() => result.current.annuler())
    expect(remplacer).toHaveBeenLastCalledWith(etat(0))
    expect(result.current.peutAnnuler).toBe(false)
  })

  // Sans cela, annuler changerait le contenu, l'editeur re-synchroniserait, et l'etat annule
  // reviendrait aussitot dans la pile : « Annuler » ne remonterait jamais plus d'un cran.
  it('ne reempile pas l etat qu il vient de restaurer', () => {
    const { result, remplacer } = monter()
    act(() => result.current.synchroniser(etat(1)))
    act(() => {
      vi.advanceTimersByTime(REGROUPEMENT + 10)
    })
    act(() => result.current.synchroniser(etat(2)))
    act(() => {
      vi.advanceTimersByTime(REGROUPEMENT + 10)
    })

    act(() => result.current.annuler())
    // Ce que l'editeur fait vraiment : il repose dans son etat l'objet que l'historique lui
    // a rendu, puis se resynchronise avec. L'identite est donc conservee, et c'est elle que
    // la garde reconnait.
    const restaure = remplacer.mock.lastCall?.[0] as PdfDesignContent
    act(() => result.current.synchroniser(restaure))
    act(() => {
      vi.advanceTimersByTime(REGROUPEMENT + 10)
    })

    expect(result.current.peutRetablir).toBe(true)
    act(() => result.current.retablir())
    expect(remplacer).toHaveBeenLastCalledWith(etat(2))
  })

  // Revue de branche, I2 : annuler PENDANT une rafale en attente. Le minuteur restant
  // deposait apres coup l'etat qu'on venait d'annuler et tronquait le futur — le second
  // « Annuler » ne bougeait plus rien, et « Retablir » etait perdu.
  it('oublie la rafale en attente quand on annule au milieu', () => {
    const { result, remplacer } = monter()
    act(() => result.current.synchroniser(etat(1)))
    act(() => {
      vi.advanceTimersByTime(REGROUPEMENT + 10)
    })
    act(() => result.current.synchroniser(etat(2)))
    act(() => {
      vi.advanceTimersByTime(REGROUPEMENT + 10)
    })
    // Une troisieme rafale, pas encore deposee.
    act(() => result.current.synchroniser(etat(3)))
    act(() => {
      vi.advanceTimersByTime(50)
    })

    act(() => result.current.annuler())
    act(() => {
      vi.advanceTimersByTime(REGROUPEMENT + 10)
    })

    // L'etat 3 n'a jamais ete empile : on remonte de 2 vers 1, puis plus rien.
    expect(remplacer).toHaveBeenLastCalledWith(etat(1))
    expect(result.current.peutAnnuler).toBe(false)
    expect(result.current.peutRetablir).toBe(true)
  })
})
