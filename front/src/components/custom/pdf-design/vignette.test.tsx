import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PdfPage } from '../../../types/pdfDesign.ts'
import Vignette from './vignette.tsx'

const toile: PdfPage = {
  kind: 'canvas',
  id: 'p1',
  background: '#ffffff',
  elements: [
    {
      id: 'e1',
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
}

describe('Vignette', () => {
  // Le prefixe `apercu-` distingue la miniature de la toile editable : l'editeur rend la
  // meme page deux fois, et deux noeuds de meme testid se marcheraient dessus.
  it('dessine le contenu de la toile', () => {
    render(<Vignette page={toile} largeur={72} />)
    expect(screen.getByTestId('apercu-element-e1')).toBeInTheDocument()
  })

  it('garde le rapport de la page A4', () => {
    render(<Vignette page={toile} largeur={100} />)
    const cadre = screen.getByTestId('vignette-p1')
    expect(cadre.style.width).toBe('100px')
    // 100 x 841,89 / 595,28 = 141,4...
    expect(Math.round(Number.parseFloat(cadre.style.height))).toBe(141)
  })

  // La page calendrier est produite par du code, pas par la toile : il n'y a rien a
  // dessiner, et inventer un faux planning mentirait sur ce que le PDF contiendra.
  it('annonce la page calendrier au lieu de la dessiner', () => {
    render(<Vignette page={{ kind: 'calendar', id: 'c1' }} largeur={72} />)
    expect(screen.getByText('Calendrier')).toBeInTheDocument()
  })

  it('ne met aucun element de la toile dans l ordre de tabulation', () => {
    render(<Vignette page={toile} largeur={72} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
