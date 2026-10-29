import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PdfCanvasPage, PdfElement } from '../../../types/pdfDesign.ts'
import CanvasPage, { elementStyle } from './render-canvas.tsx'

const geometrie = { id: 'e1', x: 10, y: 20, w: 100, h: 30, rotation: 0 }

const texte: PdfElement = {
  ...geometrie,
  kind: 'text',
  runs: [
    { id: 'r1', text: 'Bonjour ', bold: false, italic: false },
    { id: 'r2', field: 'patient.name', bold: false, italic: false },
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
      minHeight: 15,
    })
  })

  it('met la taille de police a l echelle, sinon le texte ne suit pas la boite', () => {
    expect(elementStyle(texte, 0.5)).toMatchObject({ fontSize: 6 })
  })

  it('traduit vAlign en justifyContent', () => {
    expect(elementStyle(texte, 1)).toMatchObject({ justifyContent: 'flex-end' })
  })

  // Revue de branche, minor 4 : la toile COUPAIT le texte trop long (hauteur fixe + overflow
  // hidden) la ou render-pdf le fait GRANDIR (`minHeight`). L'editeur cachait donc du texte
  // que le PDF imprime — ce n'est pas l'ecart de metriques que la spec assume, c'est une
  // regle differente. Les deux moteurs grandissent maintenant pareil.
  it('laisse le texte grandir au lieu de le couper, comme le PDF', () => {
    const style = elementStyle(texte, 1)
    expect(style).toMatchObject({ minHeight: 30 })
    expect(style).not.toHaveProperty('height')
    expect(style.overflow).not.toBe('hidden')
  })

  // Les formes, elles, gardent une hauteur ferme : un rectangle qui grandirait tout seul ne
  // voudrait rien dire.
  it('garde une hauteur ferme sur une forme', () => {
    const filet: PdfElement = {
      ...geometrie,
      kind: 'rect',
      fill: '#e05a5a',
      radius: 0,
    }
    expect(elementStyle(filet, 1)).toMatchObject({ height: 30 })
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

  // L'interrupteur coupe : on voit alors QUELLES parties du texte changeront d'un patient a
  // l'autre, ce qu'une valeur d'exemple ne dit pas.
  it('nomme la donnee au lieu de l echantillon quand les donnees d exemple sont coupees', () => {
    render(
      <CanvasPage page={page([texte])} echelle={1} donneesExemple={false} />,
    )
    expect(screen.getByText('Nom du patient')).toBeInTheDocument()
    expect(screen.queryByText(/DUPONT Jean/)).not.toBeInTheDocument()
    // Le texte fixe, lui, reste du texte.
    expect(screen.getByText(/Bonjour/)).toBeInTheDocument()
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

  // Une miniature n'est pas un editeur : ses elements ne doivent etre ni cliquables ni
  // atteignables au clavier, sinon une bande de quatre vignettes ajoute des dizaines
  // d'arrets de tabulation vers des boutons qui ne font rien.
  it('ne rend aucun bouton quand elle n est pas interactive', () => {
    render(<CanvasPage page={page([texte])} echelle={0.2} interactif={false} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByTestId('apercu-element-e1')).toBeInTheDocument()
  })

  // Revue de branche, I3 : la page courante est rendue DEUX fois dans l'editeur — par la
  // toile et par sa vignette dans la bande. Un testid commun armait un piege : le prochain
  // `getByTestId('element-titre')` tomberait sur « Found multiple elements », et une lecture
  // de `data-selectionne` pouvait viser la copie inerte, toujours « false ».
  it('prefixe ses identifiants de test quand elle n est pas interactive', () => {
    render(<CanvasPage page={page([texte])} echelle={0.2} interactif={false} />)
    expect(screen.queryByTestId('element-e1')).not.toBeInTheDocument()
  })

  it('rend des boutons par defaut', () => {
    render(<CanvasPage page={page([texte])} echelle={1} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  const imageDeposee: PdfElement = {
    ...geometrie,
    kind: 'image',
    source: { assetId: 'a1' },
    fit: 'contain',
  }

  it('rend une image deposee a partir des octets fournis', () => {
    render(
      <CanvasPage
        page={page([imageDeposee])}
        echelle={1}
        sources={{ a1: 'data:image/png;base64,AAAA' }}
      />,
    )
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      'data:image/png;base64,AAAA',
    )
  })

  // L'image a ete supprimee, ou le design vient d'un autre service : la page sort sans elle,
  // plutot qu'avec l'icone de fichier casse d'un `src` vide.
  it('ne rend rien pour une image dont les octets manquent', () => {
    render(<CanvasPage page={page([imageDeposee])} echelle={1} sources={{}} />)
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
    expect(screen.getByTestId('element-e1')).toBeInTheDocument()
  })

  // Une image livree est dans le bundle : elle n'a besoin d'aucune source.
  it('rend une image livree sans avoir besoin de sources', () => {
    const livree: PdfElement = {
      ...geometrie,
      kind: 'image',
      source: { builtin: 'logo-chu' },
      fit: 'contain',
    }
    render(<CanvasPage page={page([livree])} echelle={1} />)
    expect(screen.getByRole('presentation')).toBeInTheDocument()
  })

  // Un contenu d'une version future peut porter un `kind` que ce front ne connait pas : il
  // manque a l'ecran, il ne fait pas tomber l'editeur.
  it('ignore un element de type inconnu au lieu de planter', () => {
    const inconnu = { ...geometrie, kind: 'qrcode' } as unknown as PdfElement
    render(<CanvasPage page={page([inconnu, texte])} echelle={1} />)
    expect(screen.getByTestId('element-e1')).toBeInTheDocument()
  })
})
