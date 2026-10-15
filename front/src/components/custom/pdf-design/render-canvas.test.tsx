import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PdfCanvasPage, PdfElement } from '../../../types/pdfDesign.ts'
import CanvasPage, { elementStyle } from './render-canvas.tsx'

const geometrie = { id: 'e1', x: 10, y: 20, w: 100, h: 30, rotation: 0 }

const texte: PdfElement = {
  ...geometrie,
  kind: 'text',
  runs: [
    { text: 'Bonjour ', bold: false, italic: false },
    { field: 'patient.name', bold: false, italic: false },
  ],
  fontSize: 12,
  bold: false,
  italic: false,
  color: '#221755',
  align: 'center',
  vAlign: 'bottom',
}

const page = (elements: PdfElement[]): PdfCanvasPage => ({
  kind: 'canvas',
  id: 'p1',
  background: '#ffffff',
  elements,
})

describe('elementStyle', () => {
  it('convertit les points en pixels par l echelle', () => {
    expect(elementStyle(texte, 0.5)).toMatchObject({
      position: 'absolute',
      left: 5,
      top: 10,
      width: 50,
      height: 15,
    })
  })

  it('met la taille de police a l echelle, sinon le texte ne suit pas la boite', () => {
    expect(elementStyle(texte, 0.5)).toMatchObject({ fontSize: 6 })
  })

  it('traduit vAlign en justifyContent', () => {
    expect(elementStyle(texte, 1)).toMatchObject({ justifyContent: 'flex-end' })
  })

  // react-pdf refuse un borderRadius nul ; le moteur HTML tient la meme regle, pour que les
  // deux lisent le meme JSON de la meme facon.
  it('n emet pas de borderRadius nul', () => {
    const filet: PdfElement = {
      ...geometrie,
      kind: 'rect',
      fill: '#e05a5a',
      radius: 0,
    }
    expect(elementStyle(filet, 1)).not.toHaveProperty('borderRadius')
  })

  it('rend une ellipse par un borderRadius de 50 pour cent', () => {
    const rond: PdfElement = {
      ...geometrie,
      kind: 'ellipse',
      fill: { token: 'pathway.color', fallback: '#e6aff6' },
    }
    expect(elementStyle(rond, 1)).toMatchObject({ borderRadius: '50%' })
  })
})

describe('CanvasPage', () => {
  // L'editeur ne montre jamais un vrai patient : un echantillon, et c'est tout.
  it('affiche un echantillon a la place d une donnee', () => {
    render(<CanvasPage page={page([texte])} echelle={1} />)
    expect(screen.getByText(/DUPONT Jean/)).toBeInTheDocument()
  })

  it('garde le texte fixe autour de la donnee', () => {
    render(<CanvasPage page={page([texte])} echelle={1} />)
    expect(screen.getByText(/Bonjour/)).toBeInTheDocument()
  })

  // Trouve a l'ecran : les runs s'empilaient verticalement, un par ligne, la ou react-pdf les
  // imbrique dans un SEUL <Text> donc en ligne. Le conteneur est en colonne pour `vAlign` ;
  // les runs doivent donc vivre dans un bloc a eux, ou ils redeviennent en ligne.
  it('met les runs en ligne, comme le PDF, et non un par ligne', () => {
    render(<CanvasPage page={page([texte])} echelle={1} />)
    const premier = screen.getByText(/Bonjour/)
    const second = screen.getByText(/DUPONT Jean/)
    expect(premier.parentElement).toBe(second.parentElement)
    expect(premier.parentElement?.style.display).not.toBe('flex')
  })

  it('signale l element selectionne', () => {
    render(<CanvasPage page={page([texte])} echelle={1} selectionId="e1" />)
    expect(screen.getByTestId('element-e1')).toHaveAttribute(
      'data-selectionne',
      'true',
    )
  })

  it('previent du clic avec l identifiant de l element', () => {
    const vus: string[] = []
    render(
      <CanvasPage
        page={page([texte])}
        echelle={1}
        onSelect={(id) => vus.push(id)}
      />,
    )
    screen.getByTestId('element-e1').click()
    expect(vus).toEqual(['e1'])
  })

  // Un contenu d'une version future peut porter un `kind` que ce front ne connait pas : il
  // manque a l'ecran, il ne fait pas tomber l'editeur.
  it('ignore un element de type inconnu au lieu de planter', () => {
    const inconnu = { ...geometrie, kind: 'qrcode' } as unknown as PdfElement
    render(<CanvasPage page={page([inconnu, texte])} echelle={1} />)
    expect(screen.getByTestId('element-e1')).toBeInTheDocument()
  })
})
