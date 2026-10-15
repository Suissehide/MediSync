import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  A4_HEIGHT,
  A4_WIDTH,
  type PdfElement,
} from '../../../../types/pdfDesign.ts'
import Inspecteur from './inspecteur.tsx'

const texte: PdfElement = {
  id: 'e1',
  kind: 'text',
  x: 10,
  y: 20,
  w: 100,
  h: 30,
  rotation: 0,
  runs: [{ text: 'Bonjour', bold: false, italic: false }],
  fontSize: 12,
  bold: false,
  italic: false,
  color: '#04182b',
  align: 'left',
  vAlign: 'top',
}

// L'inspecteur est monte avec un ETAT qui applique vraiment les modifications : sans cela les
// champs restent a leur valeur d'origine et chaque frappe se concatene a elle, ce qui mesure
// l'artefact du harnais et non le composant.
const monter = (depart: PdfElement = texte) => {
  const vus: Partial<PdfElement>[] = []
  const Harnais = () => {
    const [element, setElement] = useState(depart)
    return (
      <Inspecteur
        element={element}
        onModifier={(champs) => {
          vus.push(champs)
          setElement((avant) => ({ ...avant, ...champs }) as PdfElement)
        }}
        onSupprimer={vi.fn()}
        onDupliquer={vi.fn()}
        onOrdre={vi.fn()}
      />
    )
  }
  render(<Harnais />)
  return vus
}

const valeurs = (vus: Partial<PdfElement>[], champ: 'h' | 'w' | 'x') =>
  vus
    .map((c) => (c as Record<string, number | undefined>)[champ])
    .filter((v): v is number => v !== undefined)

describe('Inspecteur', () => {
  it('ne montre rien sans selection', () => {
    render(
      <Inspecteur
        element={null}
        onModifier={vi.fn()}
        onSupprimer={vi.fn()}
        onDupliquer={vi.fn()}
        onOrdre={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/Sélectionnez un élément pour le modifier/),
    ).toBeInTheDocument()
  })

  // Revue de branche, I4 : vider le champ donnait `Number('') === 0`, donc une boite de
  // hauteur nulle — l'element disparaissait de la toile, et l'enregistrement repondait 400
  // avec un toast qui ne nommait ni le champ ni l'element.
  it('ne rend jamais une hauteur nulle quand on vide le champ', async () => {
    const vus = monter()

    await userEvent.clear(screen.getByLabelText('Hauteur'))

    expect(valeurs(vus, 'h')).not.toContain(0)
  })

  it('ne rend jamais une largeur nulle quand on vide le champ', async () => {
    const vus = monter()

    await userEvent.clear(screen.getByLabelText('Largeur'))

    expect(valeurs(vus, 'w')).not.toContain(0)
  })

  it('ne depasse pas le format de la page en hauteur', async () => {
    const vus = monter()
    const champ = screen.getByLabelText('Hauteur')

    await userEvent.clear(champ)
    await userEvent.type(champ, '5000')

    for (const h of valeurs(vus, 'h')) {
      expect(h).toBeLessThanOrEqual(A4_HEIGHT)
    }
  })

  it('ne depasse pas le format de la page en largeur', async () => {
    const vus = monter()
    const champ = screen.getByLabelText('Largeur')

    await userEvent.clear(champ)
    await userEvent.type(champ, '9000')

    for (const w of valeurs(vus, 'w')) {
      expect(w).toBeLessThanOrEqual(A4_WIDTH)
    }
  })

  // X et Y acceptent le negatif : c'est ainsi qu'on fait deborder un decor, et la spec le veut.
  // Le plafond ne doit pas emporter cette liberte avec lui.
  it('laisse passer une abscisse negative', async () => {
    const vus = monter()
    const champ = screen.getByLabelText('X')

    await userEvent.clear(champ)
    await userEvent.type(champ, '-60')

    expect(valeurs(vus, 'x')).toContain(-60)
  })

  it('insere deux fois la meme donnee', async () => {
    const vus = monter()
    const bouton = screen.getByRole('button', { name: 'Nom du patient' })

    await userEvent.click(bouton)
    await userEvent.click(bouton)

    const dernier = vus.at(-1) as { runs?: PdfElement[] }
    expect(dernier.runs).toHaveLength(3)
  })
})
