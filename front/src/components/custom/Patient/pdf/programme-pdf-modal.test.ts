import { describe, expect, it } from 'vitest'

import type { PdfDesignSummary } from '../../../../types/pdfDesignList.ts'
import { chooseDesign } from './programme-pdf-modal.tsx'

const design = (id: string, isDefault = false): PdfDesignSummary => ({
  id,
  name: id,
  content: {
    version: 1,
    pages: [{ kind: 'canvas', id: 'p1', background: '#ffffff', elements: [] }],
  },
  isDefault,
})

// Review Focus 3 de l'etape 2. Le test e2e correspondant n'assertait que « il reste des
// presets », ce qui etait deja vrai avant la suppression : il ne pouvait pas rougir. Le repli
// vit ici, dans l'ordre de la liste, et c'est ici qu'il se tient.
describe('chooseDesign', () => {
  it('prend le choix explicite avant tout', () => {
    const liste = [design('a'), design('b', true)]
    expect(chooseDesign(liste, 'a')?.id).toBe('a')
  })

  it('prend le design par defaut du service quand rien n est choisi', () => {
    const liste = [design('a'), design('b', true)]
    expect(chooseDesign(liste, null)?.id).toBe('b')
  })

  it('retombe sur le premier quand aucun n est par defaut', () => {
    const liste = [design('a'), design('b')]
    expect(chooseDesign(liste, null)?.id).toBe('a')
  })

  // Le cas du Review Focus : le service vient de supprimer son unique design, qui etait le
  // defaut. Il ne reste que les presets, et la modale doit en produire un, pas « aucun ».
  it('retombe sur un preset quand le service n a plus de design', () => {
    const presetsSeuls = [design('preset-smcv')]
    expect(chooseDesign(presetsSeuls, null)?.id).toBe('preset-smcv')
  })

  // Un identifiant qui ne correspond plus a rien : le design choisi vient d'etre supprime
  // dans un autre onglet, ou la liste a ete rafraichie sous les pieds de la modale.
  it('ignore un identifiant devenu introuvable au lieu de ne rien rendre', () => {
    const liste = [design('a'), design('b', true)]
    expect(chooseDesign(liste, 'disparu')?.id).toBe('b')
  })

  it('ne rend rien quand il n y a vraiment aucun design', () => {
    expect(chooseDesign([], null)).toBeUndefined()
  })
})
