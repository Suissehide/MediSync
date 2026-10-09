import { createColumnHelper } from '@tanstack/react-table'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { choiceColumn } from './choiceColumn.tsx'
import { ReactTable } from './reactTable.tsx'

// jsdom mesure un conteneur nul : le virtualiseur réel ne rendrait aucune ligne.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        start: index * options.estimateSize(),
        end: (index + 1) * options.estimateSize(),
        size: options.estimateSize(),
      })),
    getTotalSize: () => options.count * options.estimateSize(),
    scrollToIndex: () => undefined,
    measure: () => undefined,
    measureElement: () => undefined,
  }),
}))

type Ligne = { id: string; nom: string; diag: string | null }

const helper = createColumnHelper<Ligne>()
const colonneNom = helper.accessor('nom', { header: 'Nom' })
const colonnes = [
  colonneNom,
  choiceColumn<Ligne>('diag', (l) => l.diag, {
    label: 'Diagnostic médical',
    group: 'Inclusion',
    choices: [
      { value: 'AOMI', label: 'AOMI' },
      { value: 'AVC', label: 'AVC' },
    ],
  }),
]
const lignes: Ligne[] = [
  { id: '1', nom: 'Alpha', diag: 'AVC' },
  { id: '2', nom: 'Bravo', diag: 'AOMI' },
  { id: '3', nom: 'Charlie', diag: null },
]

const noms = () =>
  ['Alpha', 'Bravo', 'Charlie'].filter((n) => screen.queryByText(n))

const barre = () => within(screen.getByRole('toolbar'))

const afficherColonne = async (label: string) => {
  await userEvent.click(screen.getByRole('button', { name: /Colonnes/ }))
  await userEvent.click(
    await screen.findByRole('menuitemcheckbox', { name: label }),
  )
  await userEvent.keyboard('{Escape}')
}

const cocherFiltre = async (colonne: string, choix: RegExp) => {
  await userEvent.click(barre().getByRole('button', { name: colonne }))
  await userEvent.click(
    await screen.findByRole('menuitemcheckbox', { name: choix }),
  )
  await userEvent.keyboard('{Escape}')
}

describe('ReactTable : colonnes optionnelles', () => {
  it('masque une colonne optionnelle par defaut, sans filtre', () => {
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    expect(screen.queryByText('Diagnostic médical')).toBeNull()
    expect(screen.getByRole('button', { name: /Colonnes/ })).toBeTruthy()
  })

  it('cocher la colonne l affiche avec son filtre, et le filtre ne garde que les lignes cochees', async () => {
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    await afficherColonne('Diagnostic médical')

    expect(
      screen.getByRole('columnheader', { name: /Diagnostic médical/ }),
    ).toBeTruthy()
    await cocherFiltre('Diagnostic médical', /^AVC/)
    expect(noms()).toEqual(['Alpha'])
    expect(
      barre().getByRole('button', { name: 'Diagnostic médical · 1' }),
    ).toBeTruthy()
  })

  it('compte et filtre les vides sous Non renseigne', async () => {
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    await afficherColonne('Diagnostic médical')
    await userEvent.click(
      barre().getByRole('button', { name: 'Diagnostic médical' }),
    )
    const item = await screen.findByRole('menuitemcheckbox', {
      name: /Non renseigné/,
    })
    expect(within(item).getByText('1')).toBeTruthy()
    await userEvent.click(item)
    await userEvent.keyboard('{Escape}')
    expect(noms()).toEqual(['Charlie'])
  })

  it('masquer la colonne efface son filtre et son tri', async () => {
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    await afficherColonne('Diagnostic médical')
    await userEvent.click(
      screen
        .getByRole('columnheader', { name: /Diagnostic médical/ })
        .querySelector('button') as HTMLElement,
    )
    expect(JSON.parse(localStorage.getItem('sorting/t') ?? '[]')).toHaveLength(
      1,
    )
    await cocherFiltre('Diagnostic médical', /^AVC/)
    await afficherColonne('Diagnostic médical')

    expect(noms()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(JSON.parse(localStorage.getItem('filters/t') ?? '[]')).toEqual([])
    expect(JSON.parse(localStorage.getItem('sorting/t') ?? '[]')).toEqual([])
  })

  it('ignore au chargement un filtre memorise sur une colonne masquee', () => {
    localStorage.setItem('column-visibility/t', JSON.stringify({ diag: false }))
    localStorage.setItem(
      'filters/t',
      JSON.stringify([{ id: 'diag', value: ['AVC'] }]),
    )
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    expect(noms()).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('restaure une colonne visible et son filtre', () => {
    localStorage.setItem('column-visibility/t', JSON.stringify({ diag: true }))
    localStorage.setItem(
      'filters/t',
      JSON.stringify([{ id: 'diag', value: ['AOMI'] }]),
    )
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    expect(noms()).toEqual(['Bravo'])
  })

  it('resetSignal vide les filtres et previent la page', async () => {
    const onActive = vi.fn()
    const { rerender } = render(
      <ReactTable
        data={lignes}
        columns={colonnes}
        filterId="t"
        resetSignal={0}
        onColumnFiltersActiveChange={onActive}
      />,
    )
    await afficherColonne('Diagnostic médical')
    await cocherFiltre('Diagnostic médical', /^AVC/)
    expect(onActive).toHaveBeenLastCalledWith(true)

    rerender(
      <ReactTable
        data={lignes}
        columns={colonnes}
        filterId="t"
        resetSignal={1}
        onColumnFiltersActiveChange={onActive}
      />,
    )
    expect(noms()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(onActive).toHaveBeenLastCalledWith(false)
  })

  it('filtrer revient a la premiere page', async () => {
    const beaucoup: Ligne[] = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      nom: `P${String(i).padStart(2, '0')}`,
      diag: i === 0 ? 'AVC' : 'AOMI',
    }))
    render(
      <ReactTable data={beaucoup} columns={colonnes} filterId="t" pagination />,
    )
    await userEvent.click(screen.getByRole('button', { name: '2' }))
    expect(screen.queryByText('P00')).toBeNull()
    await afficherColonne('Diagnostic médical')
    await cocherFiltre('Diagnostic médical', /^AVC/)
    expect(screen.getByText('P00')).toBeTruthy()
  })

  it('ignore une visibilite memorisee pour une colonne qui n est pas optionnelle', () => {
    localStorage.setItem('column-visibility/t', JSON.stringify({ nom: false }))
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    expect(noms()).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('sans toolbar ni colonne optionnelle, aucune barre d outils', () => {
    render(<ReactTable data={lignes} columns={[colonneNom]} filterId="t" />)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })
})
