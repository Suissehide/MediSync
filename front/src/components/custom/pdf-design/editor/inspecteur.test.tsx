import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { PdfAssetSummary } from '../../../../types/pdfAsset.ts'
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
const monter = (
  depart: PdfElement = texte,
  options: {
    assets?: PdfAssetSummary[]
    onDeposer?: (fichier: File) => Promise<PdfAssetSummary>
  } = {},
) => {
  const vus: Partial<PdfElement>[] = []
  const Harnais = () => {
    const [element, setElement] = useState(depart)
    return (
      <Inspecteur
        element={element}
        assets={options.assets}
        onDeposer={options.onDeposer}
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

const image: PdfElement = {
  id: 'e1',
  kind: 'image',
  x: 10,
  y: 20,
  w: 100,
  h: 80,
  rotation: 0,
  source: { builtin: 'logo-chu' },
  fit: 'contain',
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

  it('propose les images du service a cote des images livrees', async () => {
    monter(image, {
      assets: [{ id: 'a1', fileName: 'mon-logo.png', mimeType: 'image/png' }],
    })

    await userEvent.click(screen.getByLabelText('Image'))

    expect(
      await screen.findByRole('option', { name: 'mon-logo.png' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Logo' })).toBeInTheDocument()
  })

  it('pose l image choisie comme source de l element', async () => {
    const vus = monter(image, {
      assets: [{ id: 'a1', fileName: 'mon-logo.png', mimeType: 'image/png' }],
    })

    await userEvent.click(screen.getByLabelText('Image'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'mon-logo.png' }),
    )

    expect(vus.at(-1)).toEqual({ source: { assetId: 'a1' } })
  })

  // CE QUE CE TEST MESURE, exactement : que `sourceDepuisChoix` lit le prefixe et rend bien un
  // `assetId`. Il ne reproduit PAS une collision — il ne le peut pas : la valeur d'une option
  // deposee est `asset:<cuid>`, jamais son nom de fichier, qui n'est que l'etiquette. Le
  // prefixe reste justifie pour une autre raison : sans lui, `sourceDepuisChoix` devrait
  // deviner la famille d'un choix.
  it('lit le prefixe plutot que le nom pour choisir la famille de l image', async () => {
    const vus = monter(image, {
      assets: [{ id: 'a2', fileName: 'logo-chu', mimeType: 'image/png' }],
    })

    await userEvent.click(screen.getByLabelText('Image'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'logo-chu' }),
    )

    expect(vus.at(-1)).toEqual({ source: { assetId: 'a2' } })
  })

  it('depose un fichier et pose l image deposee', async () => {
    const deposer = vi.fn().mockResolvedValue({
      id: 'a2',
      fileName: 'fond.png',
      mimeType: 'image/png',
    })
    const vus = monter(image, { onDeposer: deposer })

    const fichier = new File([new Uint8Array([1, 2, 3])], 'fond.png', {
      type: 'image/png',
    })
    await userEvent.upload(screen.getByLabelText(/Déposer une image/), fichier)

    await waitFor(() => {
      expect(deposer).toHaveBeenCalledWith(fichier)
    })
    await waitFor(() => {
      expect(vus.at(-1)).toEqual({ source: { assetId: 'a2' } })
    })
  })

  // Un depot refuse (trop gros, pas une image) ne doit pas poser une source inventee : le
  // message vient de la mutation, l'element reste sur son image precedente.
  it('ne change pas la source quand le depot echoue', async () => {
    const deposer = vi.fn().mockRejectedValue(new Error('trop gros'))
    const vus = monter(image, { onDeposer: deposer })

    const fichier = new File([new Uint8Array([1])], 'trop.png', {
      type: 'image/png',
    })
    await userEvent.upload(screen.getByLabelText(/Déposer une image/), fichier)

    await waitFor(() => {
      expect(deposer).toHaveBeenCalled()
    })
    expect(vus).toHaveLength(0)
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
