import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, type Mock, vi } from 'vitest'

import type { PdfPage } from '../../../../types/pdfDesign.ts'
import ColonnePages from './colonne-pages.tsx'

const toile = (id: string): PdfPage => ({
  kind: 'canvas',
  id,
  background: '#ffffff',
  elements: [],
})

const monter = (
  pages: PdfPage[],
  over: Partial<Parameters<typeof ColonnePages>[0]> = {},
) => {
  const props = {
    pages,
    courantId: pages[0]?.id ?? null,
    peutAjouterCalendrier: true,
    onChoisir: vi.fn(),
    onAjouterToile: vi.fn(),
    onAjouterCalendrier: vi.fn(),
    onDeposer: vi.fn(),
    ...over,
  }
  render(<ColonnePages {...props} />)
  return props
}

const page = (id: string) => screen.getByTestId(`page-${id}`)

// jsdom ne met rien en page : toute boite mesure zero, donc « moitie haute » et « moitie
// basse » seraient indiscernables. On donne a la page survolee une boite reelle.
const boite = (id: string, top: number, height: number) => {
  vi.spyOn(page(id), 'getBoundingClientRect').mockReturnValue({
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  })
}

// jsdom ne porte pas de presse-papiers de glissement : sans ce faux `dataTransfer`, le
// gestionnaire leve et le glissement ne demarre jamais.
const dataTransfer = () => ({ setData: vi.fn(), effectAllowed: '' })

const commencer = (id: string) =>
  fireEvent.dragStart(page(id), { dataTransfer: dataTransfer() })

// jsdom n'implemente pas `DragEvent`, et l'`Event` de repli jette les coordonnees : sans un
// `MouseEvent` explicite, `clientY` arriverait `undefined` et les deux moities du geste
// seraient indiscernables.
const survoler = (id: string, clientY: number) =>
  fireEvent(
    page(id),
    new MouseEvent('dragover', { bubbles: true, cancelable: true, clientY }),
  )

const glisser = (depuis: string, vers: string, clientY: number) => {
  commencer(depuis)
  survoler(vers, clientY)
  fireEvent.drop(page(vers))
}

describe('ColonnePages', () => {
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
    expect(page('b')).toHaveAttribute('data-courante', 'true')
    expect(page('a')).toHaveAttribute('data-courante', 'false')
  })

  it('previent du choix d une page', async () => {
    const props = monter([toile('a'), toile('b')])
    await userEvent.click(page('b'))
    expect(props.onChoisir).toHaveBeenCalledWith('b')
  })

  // Le calendrier porte son nom : l'appeler « Page 2 » laisserait croire qu'on peut y poser
  // un texte. Et les toiles se numerotent entre elles, donc l'inserer au milieu ne decale
  // pas la numerotation des autres.
  it('nomme la page calendrier au lieu de la numeroter', () => {
    monter([toile('a'), { kind: 'calendar', id: 'c' }, toile('b')])
    expect(page('c')).toHaveAttribute('aria-label', 'Afficher Calendrier')
    expect(page('b')).toHaveAttribute('aria-label', 'Afficher Page 2')
  })

  // La regle du depot : moitie haute = avant la page survolee, moitie basse = apres. C'est
  // ce qui rend le dernier rang atteignable.
  it('depose apres la page survolee quand on lache dans sa moitie basse', () => {
    const props = monter([toile('a'), toile('b'), toile('c')])
    boite('b', 100, 100)
    glisser('a', 'b', 180)
    expect(props.onDeposer).toHaveBeenCalledWith('a', 2)
  })

  it('depose avant la page survolee quand on lache dans sa moitie haute', () => {
    const props = monter([toile('a'), toile('b'), toile('c')])
    boite('b', 100, 100)
    glisser('c', 'b', 120)
    expect(props.onDeposer).toHaveBeenCalledWith('c', 1)
  })

  // Deposer sur soi-meme ne change rien : aucun indicateur, et rien ne remonte.
  it('n affiche aucun indicateur quand la position ne changerait pas', () => {
    monter([toile('a'), toile('b')])
    boite('a', 0, 100)
    commencer('a')
    survoler('a', 20)
    expect(screen.queryByTestId('indicateur-depot')).not.toBeInTheDocument()
  })

  it('affiche l indicateur a la position d insertion', () => {
    monter([toile('a'), toile('b'), toile('c')])
    boite('c', 200, 100)
    commencer('a')
    survoler('c', 220)
    expect(screen.getByTestId('indicateur-depot')).toBeInTheDocument()
  })

  it('met une page en dernier par la zone de depot du bas', () => {
    const props = monter([toile('a'), toile('b')])
    commencer('a')
    fireEvent.dragOver(screen.getByTestId('depot-fin'))
    fireEvent.drop(screen.getByTestId('depot-fin'))
    expect(props.onDeposer).toHaveBeenCalledWith('a', 2)
  })

  // Le meme geste sans souris : sans lui, l'ordre des pages serait hors d'atteinte au clavier.
  it('reordonne au clavier avec Alt et les fleches', () => {
    const props = monter([toile('a'), toile('b'), toile('c')])

    fireEvent.keyDown(page('c'), { key: 'ArrowUp', altKey: true })
    expect(props.onDeposer).toHaveBeenCalledWith('c', 1)

    fireEvent.keyDown(page('a'), { key: 'ArrowDown', altKey: true })
    expect(props.onDeposer).toHaveBeenCalledWith('a', 2)

    // Sans Alt, la fleche appartient a l'element selectionne sur la toile.
    const avant = (props.onDeposer as Mock).mock.calls.length
    fireEvent.keyDown(page('a'), { key: 'ArrowDown' })
    expect((props.onDeposer as Mock).mock.calls).toHaveLength(avant)
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

  // Un document n'a qu'une page calendrier.
  it('ne propose pas le calendrier quand il y en a deja un', () => {
    monter([toile('a'), { kind: 'calendar', id: 'c' }], {
      peutAjouterCalendrier: false,
    })
    expect(
      screen.queryByRole('button', { name: /Ajouter le calendrier/ }),
    ).not.toBeInTheDocument()
  })
})
