import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { PdfAssetSummary } from '../../../../types/pdfAsset.ts'
import {
  A4_HEIGHT,
  A4_WIDTH,
  type PdfElement,
  type PdfPage,
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
  runs: [{ id: 'r1', text: 'Bonjour', bold: false, italic: false }],
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
const page = (elements: PdfElement[]): PdfPage => ({
  kind: 'canvas',
  id: 'p1',
  background: '#ffffff',
  elements,
})

// Les trois props de PAGE, identiques d'un test a l'autre : l'inspecteur en a besoin pour
// choisir son etat, et aucun test d'element ne porte sur elles.
const propsDePage = {
  nomPage: 'Page 1',
  onChoisirElement: vi.fn(),
  onDupliquerPage: vi.fn(),
  onSupprimerPage: vi.fn(),
  pageSupprimable: true,
}

type OptionsHarnais = {
  assets?: PdfAssetSummary[]
  onDeposer?: (fichier: File) => Promise<PdfAssetSummary>
}

const Harnais = ({
  depart,
  options,
  vus,
}: {
  depart: PdfElement
  options: OptionsHarnais
  vus: Partial<PdfElement>[]
}) => {
  const [element, setElement] = useState(depart)
  return (
    <Inspecteur
      {...propsDePage}
      page={page([element])}
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

const monter = (depart: PdfElement = texte, options: OptionsHarnais = {}) => {
  const vus: Partial<PdfElement>[] = []
  render(<Harnais depart={depart} options={options} vus={vus} />)
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
  // Sans selection, l'inspecteur parle de la PAGE : ses calques sont la seconde prise sur
  // les elements, celle qui attrape un decor d'arriere-plan qu'on clique mal sur la toile.
  it('liste les calques du premier plan au fond quand rien n est selectionne', async () => {
    const onChoisirElement = vi.fn()
    render(
      <Inspecteur
        {...propsDePage}
        onChoisirElement={onChoisirElement}
        page={page([
          texte,
          {
            ...texte,
            id: 'e2',
            runs: [{ id: 'r1', text: 'Devant', bold: false, italic: false }],
          },
        ])}
        element={null}
        onModifier={vi.fn()}
        onSupprimer={vi.fn()}
        onDupliquer={vi.fn()}
        onOrdre={vi.fn()}
      />,
    )
    const calques = screen.getAllByRole('button', { name: /Bonjour|Devant/ })
    expect(calques.map((n) => n.textContent)).toEqual(['Devant', 'Bonjour'])

    await userEvent.click(calques[1] as HTMLElement)
    expect(onChoisirElement).toHaveBeenCalledWith('e1')
  })

  // La page calendrier n'a ni element ni propriete : seule sa place se choisit.
  it('explique la page calendrier au lieu d en montrer les proprietes', () => {
    render(
      <Inspecteur
        {...propsDePage}
        nomPage="Calendrier"
        page={{ kind: 'calendar', id: 'c1' }}
        element={null}
        onModifier={vi.fn()}
        onSupprimer={vi.fn()}
        onDupliquer={vi.fn()}
        onOrdre={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/remplie à l'export avec les rendez-vous du patient/),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('X')).not.toBeInTheDocument()
  })

  // Le schema exige au moins une page : l'ecran l'empeche avant le 400.
  it('ne propose pas de retirer la seule page', () => {
    render(
      <Inspecteur
        {...propsDePage}
        pageSupprimable={false}
        page={page([texte])}
        element={null}
        onModifier={vi.fn()}
        onSupprimer={vi.fn()}
        onDupliquer={vi.fn()}
        onOrdre={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Supprimer la page' }),
    ).toBeDisabled()
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

  // Une image supprimee, ou un design venu d'un autre service : son `assetId` n'est dans
  // aucune option, et Radix affiche alors un champ VIDE — indiscernable de « aucune image
  // choisie ». Le reste de l'etape prend soin de nommer ce qui manque ; ici aussi.
  it('dit qu une image a disparu au lieu de laisser le champ vide', () => {
    const disparue: PdfElement = {
      ...image,
      kind: 'image',
      source: { assetId: 'a-disparue' },
      fit: 'contain',
    }
    monter(disparue, {
      assets: [{ id: 'a1', fileName: 'mon-logo.png', mimeType: 'image/png' }],
    })

    expect(screen.getByText(/Image supprimée/)).toBeInTheDocument()
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
    await userEvent.upload(
      screen.getByLabelText(/Déposer un PNG ou JPEG/),
      fichier,
    )

    await waitFor(() => {
      expect(deposer).toHaveBeenCalledWith(fichier)
    })
    await waitFor(() => {
      expect(vus.at(-1)).toEqual({ source: { assetId: 'a2' } })
    })
  })

  // L'input de fichier garde sa valeur : rechoisir LE MEME fichier n'emet aucun `change`,
  // donc il ne se passe rien — et rien ne dit pourquoi. C'est le cas apres un refus (trop
  // gros, mauvais type) : on corrige le fichier, on le rechoisit, et l'ecran reste muet.
  it('accepte deux fois de suite le meme fichier', async () => {
    const deposer = vi
      .fn()
      .mockResolvedValue({ id: 'a2', fileName: 'f.png', mimeType: 'image/png' })
    monter(image, { onDeposer: deposer })

    const champ = screen.getByLabelText(/Déposer un PNG ou JPEG/)
    const fichier = new File([new Uint8Array([1])], 'f.png', {
      type: 'image/png',
    })
    await userEvent.upload(champ, fichier)
    await waitFor(() => {
      expect(deposer).toHaveBeenCalledTimes(1)
    })
    await userEvent.upload(champ, fichier)

    await waitFor(() => {
      expect(deposer).toHaveBeenCalledTimes(2)
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
    await userEvent.upload(
      screen.getByLabelText(/Déposer un PNG ou JPEG/),
      fichier,
    )

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

  // A LA POSITION DU CURSEUR, pas a la fin : le run de texte courant est coupe en deux et la
  // donnee se glisse entre les morceaux. Ajouter a la fin obligeait a tout retaper pour
  // mettre un nom au milieu d'une phrase.
  it('insere la donnee a la position du curseur', async () => {
    const vus = monter()
    const champ = screen.getByLabelText('Texte 1') as HTMLInputElement

    champ.focus()
    champ.setSelectionRange(3, 3)
    fireEvent.select(champ)
    await userEvent.click(
      screen.getByRole('button', { name: 'Nom du patient' }),
    )

    const dernier = vus.at(-1) as {
      runs?: { id: string; text?: string; field?: string }[]
    }
    expect(dernier.runs).toEqual([
      { id: 'r1', text: 'Bon', bold: false, italic: false },
      {
        id: expect.any(String),
        field: 'patient.name',
        bold: false,
        italic: false,
      },
      { id: expect.any(String), text: 'jour', bold: false, italic: false },
    ])
    // Couper un run en deux ne doit pas dupliquer son id : il sert de cle de rendu.
    expect(new Set(dernier.runs?.map((run) => run.id)).size).toBe(3)
  })

  // Le schema exige au moins un run : retirer le dernier produirait un contenu que
  // l'enregistrement refuserait, et l'utilisateur ne l'apprendrait qu'au 400.
  it('ne vide jamais completement le contenu en retirant une donnee', async () => {
    const vus = monter({
      ...texte,
      runs: [{ id: 'r1', field: 'patient.name', bold: false, italic: false }],
    })

    await userEvent.click(
      screen.getByRole('button', { name: 'Retirer Nom du patient' }),
    )

    const dernier = vus.at(-1) as { runs?: { text?: string }[] }
    expect(dernier.runs).toEqual([
      { id: expect.any(String), text: '', bold: false, italic: false },
    ])
  })
})
