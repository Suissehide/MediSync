import type { CellContext } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Thematic } from '../types/thematic.ts'
import { getThematicColumns } from './thematic.column.tsx'

const baseProps = {
  onArchive: vi.fn(),
  onRestore: vi.fn(),
  onDeleteForever: vi.fn(),
  archived: false,
  soignantOptions: [],
  canManage: false,
}

const thematic = (role: Thematic['role']): Thematic => ({
  id: '1',
  name: 'Thematique test',
  soignants: [],
  role,
})

const roleCell = () => {
  const columns = getThematicColumns(baseProps)
  const roleColumn = columns.find((column) => column.id === 'role')
  if (!roleColumn?.cell) {
    throw new Error('colonne role introuvable')
  }
  return roleColumn.cell as (
    context: CellContext<Thematic, unknown>,
  ) => React.ReactNode
}

describe('colonne Role de la thematique', () => {
  it('affiche le libelle du role quand defini', () => {
    const cell = roleCell()
    render(
      <>{cell({ row: { original: thematic('BILAN_DE_FIN') } } as never)}</>,
    )
    expect(screen.getByText('Bilan de fin')).toBeTruthy()
  })

  it('affiche un tiret quand le role est nul', () => {
    const cell = roleCell()
    render(<>{cell({ row: { original: thematic(null) } } as never)}</>)
    expect(screen.getByText('—')).toBeTruthy()
  })
})
