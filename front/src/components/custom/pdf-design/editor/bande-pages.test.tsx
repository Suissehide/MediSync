import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PdfPage } from '../../../../types/pdfDesign.ts'
import BandePages from './bande-pages.tsx'

const toile = (id: string): PdfPage => ({
  kind: 'canvas',
  id,
  background: '#ffffff',
  elements: [],
})

const monter = (
  pages: PdfPage[],
  over: Partial<Parameters<typeof BandePages>[0]> = {},
) => {
  const props = {
    pages,
    courantId: pages[0]?.id ?? null,
    peutAjouterCalendrier: true,
    onChoisir: vi.fn(),
    onAjouterToile: vi.fn(),
    onAjouterCalendrier: vi.fn(),
    onSupprimer: vi.fn(),
    onDeplacer: vi.fn(),
    ...over,
  }
  render(<BandePages {...props} />)
  return props
}

const carte = (id: string) => within(screen.getByTestId(`page-${id}`))

describe('BandePages', () => {
  it('montre une vignette par page, dans l ordre', () => {
    monter([toile('a'), { kind: 'calendar', id: 'c' }, toile('b')])
    const cartes = screen.getAllByTestId(/^page-/)
    expect(cartes.map((n) => n.dataset.testid)).toEqual([
      'page-a',
      'page-c',
      'page-b',
    ])
  })

  it('signale la page courante', () => {
    monter([toile('a'), toile('b')], { courantId: 'b' })
    expect(screen.getByTestId('page-b')).toHaveAttribute(
      'data-courante',
      'true',
    )
    expect(screen.getByTestId('page-a')).toHaveAttribute(
      'data-courante',
      'false',
    )
  })

  it('previent du choix d une page', async () => {
    const props = monter([toile('a'), toile('b')])
    await userEvent.click(
      carte('b').getByRole('button', { name: 'Afficher Page 2' }),
    )
    expect(props.onChoisir).toHaveBeenCalledWith('b')
  })

  // Le calendrier porte son nom : l'appeler « Page 2 » laisserait croire qu'on peut y poser
  // un texte. Et les toiles se numerotent entre elles, donc l'inserer au milieu ne decale
  // pas la numerotation des autres.
  it('nomme la page calendrier au lieu de la numeroter', () => {
    monter([toile('a'), { kind: 'calendar', id: 'c' }, toile('b')])
    expect(
      carte('c').getByRole('button', { name: 'Afficher Calendrier' }),
    ).toBeInTheDocument()
    expect(
      carte('b').getByRole('button', { name: 'Afficher Page 2' }),
    ).toBeInTheDocument()
  })

  it('avance et recule une page', async () => {
    const props = monter([toile('a'), toile('b')], { courantId: 'b' })
    await userEvent.click(carte('b').getByRole('button', { name: 'Avancer' }))
    expect(props.onDeplacer).toHaveBeenCalledWith('b', 'avant')
    await userEvent.click(carte('a').getByRole('button', { name: 'Reculer' }))
    expect(props.onDeplacer).toHaveBeenCalledWith('a', 'arriere')
  })

  it('n avance pas la premiere ni ne recule la derniere', () => {
    monter([toile('a'), toile('b')])
    expect(carte('a').getByRole('button', { name: 'Avancer' })).toBeDisabled()
    expect(carte('b').getByRole('button', { name: 'Reculer' })).toBeDisabled()
  })

  it('supprime une page', async () => {
    const props = monter([toile('a'), toile('b')])
    await userEvent.click(carte('a').getByRole('button', { name: /Supprimer/ }))
    expect(props.onSupprimer).toHaveBeenCalledWith('a')
  })

  // Review Focus 2 : le schema exige au moins une page, l'ecran l'empeche avant le 400.
  it('ne propose pas de supprimer la seule page', () => {
    monter([toile('a')])
    expect(carte('a').getByRole('button', { name: /Supprimer/ })).toBeDisabled()
  })

  it('ajoute une toile', async () => {
    const props = monter([toile('a')])
    await userEvent.click(
      screen.getByRole('button', { name: /Ajouter une page/ }),
    )
    expect(props.onAjouterToile).toHaveBeenCalled()
  })

  it('ajoute la page calendrier', async () => {
    const props = monter([toile('a')])
    await userEvent.click(
      screen.getByRole('button', { name: /Ajouter le calendrier/ }),
    )
    expect(props.onAjouterCalendrier).toHaveBeenCalled()
  })

  // Review Focus 3 : le bouton disparait quand le calendrier est deja la.
  it('ne propose pas le calendrier quand il y en a deja un', () => {
    cleanup()
    monter([toile('a'), { kind: 'calendar', id: 'c' }], {
      peutAjouterCalendrier: false,
    })
    expect(
      screen.queryByRole('button', { name: /Ajouter le calendrier/ }),
    ).not.toBeInTheDocument()
  })
})
