import { createColumnHelper, useTable } from '@tanstack/react-table'
import { render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { choiceColor } from '../../libs/choicePalette.ts'
import {
  type Choice,
  choiceColumn,
  choiceLabel,
  EMPTY_CHOICE,
  matchesChoice,
  multiChoiceColumn,
} from './choiceColumn.tsx'
import { type Features, features } from './features.ts'

type Ligne = { id: string; diag: string | null }

const CHOIX: Choice[] = [
  { value: 'CORONAROPATHIE', label: 'Coronaropathie' },
  { value: 'AVC', label: 'AVC' },
  { value: 'AOMI', label: 'Aomi' },
]

const lignes: Ligne[] = [
  { id: '1', diag: 'CORONAROPATHIE' },
  { id: '2', diag: null },
  { id: '3', diag: 'AOMI' },
  { id: '4', diag: 'AVC' },
]

const colonne = choiceColumn<Ligne>('diag', (l) => l.diag, {
  label: 'Diagnostic',
  group: 'Inclusion',
  choices: CHOIX,
})

const ids = (sorting = [{ id: 'diag', desc: false }], filtre?: string[]) =>
  renderHook(() =>
    useTable({
      features,
      data: lignes,
      columns: createColumnHelper<Features, Ligne>().columns([colonne]),
      state: {
        sorting,
        columnFilters: filtre ? [{ id: 'diag', value: filtre }] : [],
      },
      getRowId: (l) => l.id,
    }),
  )
    .result.current.getRowModel()
    .rows.map((r) => r.id)

describe('choiceColumn', () => {
  it('trie sur le libelle, vides en dernier, dans les deux sens', () => {
    expect(ids()).toEqual(['3', '4', '1', '2'])
    expect(ids([{ id: 'diag', desc: true }])).toEqual(['1', '4', '3', '2'])
  })

  it('filtre en OU, et Non renseigne retient les vides', () => {
    expect(ids([], ['AVC', EMPTY_CHOICE])).toEqual(['2', '4'])
  })

  it('matchesChoice traite undefined comme vide', () => {
    expect(matchesChoice(undefined, [EMPTY_CHOICE])).toBe(true)
    expect(matchesChoice('AVC', [EMPTY_CHOICE])).toBe(false)
  })

  it('libelle connu ou valeur brute', () => {
    expect(choiceLabel(CHOIX, 'AOMI')).toBe('Aomi')
    expect(choiceLabel(CHOIX, 'INCONNU')).toBe('INCONNU')
  })

  it('declare la colonne optionnelle et ses choix', () => {
    expect(colonne.meta).toEqual({
      optional: { label: 'Diagnostic', group: 'Inclusion' },
      choices: CHOIX,
    })
  })

  it('couleur stable par position, palette bouclee', () => {
    expect(choiceColor(1)).toBe(choiceColor(1))
    expect(choiceColor(0)).not.toBe(choiceColor(1))
    expect(choiceColor(0)).toBe(choiceColor(10))
  })

  it('cellule : etiquette avec libelle, rien si vide, valeur brute si inconnue', () => {
    const cellule = colonne.cell as (ctx: {
      getValue: () => string | undefined
    }) => ReactNode
    const { container, rerender } = render(
      <>{cellule({ getValue: () => 'AOMI' })}</>,
    )
    expect(screen.getByText('Aomi')).toBeTruthy()
    rerender(<>{cellule({ getValue: () => undefined })}</>)
    expect(container.textContent).toBe('')
    rerender(<>{cellule({ getValue: () => 'INCONNU' })}</>)
    expect(screen.getByText('INCONNU')).toBeTruthy()
  })
})

type LigneMulti = { id: string; comorbidites: string[] | null }

const CHOIX_MULTI: Choice[] = [
  { value: 'HTA', label: 'Hypertension' },
  { value: 'DIAB', label: 'Diabète' },
]

const lignesMulti: LigneMulti[] = [
  { id: '1', comorbidites: ['HTA', 'DIAB'] },
  { id: '2', comorbidites: null },
  { id: '3', comorbidites: ['DIAB'] },
  { id: '4', comorbidites: [] },
]

const colonneMulti = multiChoiceColumn<LigneMulti>(
  'comorbidites',
  (l) => l.comorbidites,
  { label: 'Comorbidités', group: 'Inclusion', choices: CHOIX_MULTI },
)

const tableMulti = (filtre?: string[]) =>
  renderHook(() =>
    useTable({
      features,
      data: lignesMulti,
      columns: createColumnHelper<Features, LigneMulti>().columns([
        colonneMulti,
      ]),
      state: {
        columnFilters: filtre ? [{ id: 'comorbidites', value: filtre }] : [],
      },
      getRowId: (l) => l.id,
    }),
  ).result.current

describe('multiChoiceColumn', () => {
  it('rend une etiquette par valeur', () => {
    const cellule = colonneMulti.cell as (ctx: {
      getValue: () => string[] | undefined
    }) => ReactNode
    render(<div>{cellule({ getValue: () => ['HTA', 'INCONNU'] })}</div>)
    expect(screen.getByText('Hypertension')).toBeTruthy()
    expect(screen.getByText('INCONNU')).toBeTruthy()
  })

  it('retient une ligne si une de ses valeurs est cochee, les vides avec Non renseigne', () => {
    const ids = (filtre: string[]) =>
      tableMulti(filtre)
        .getRowModel()
        .rows.map((r) => r.id)
    expect(ids(['HTA'])).toEqual(['1'])
    expect(ids(['DIAB'])).toEqual(['1', '3'])
    expect(ids([EMPTY_CHOICE])).toEqual(['2', '4'])
  })

  it('compte chaque valeur separement dans les facettes', () => {
    const counts = tableMulti()
      .getColumn('comorbidites')
      ?.getFacetedUniqueValues()
    expect(counts?.get('HTA')).toBe(1)
    expect(counts?.get('DIAB')).toBe(2)
    expect(counts?.get(undefined)).toBe(2)
  })
})
