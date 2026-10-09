import type { Table } from '@tanstack/react-table'
import { RotateCcw } from 'lucide-react'

import { choiceColor } from '../../libs/choicePalette.ts'
import DropdownFilter from '../ui/dropdownFilter.tsx'
import { EMPTY_CHOICE } from './choiceColumn.tsx'
import type { CustomMeta } from './reactTable.tsx'

// Un filtre à cocher par colonne à choix visible.
export function ChoiceFilters<TData>({ table }: { table: Table<TData> }) {
  return table.getVisibleLeafColumns().map((column) => {
    const meta = column.columnDef.meta as CustomMeta<TData, unknown> | undefined
    if (!meta?.choices) {
      return null
    }
    const label = meta.optional?.label ?? column.id
    const selected = (column.getFilterValue() as string[] | undefined) ?? []
    const counts = column.getFacetedUniqueValues()
    const setSelected = (next: string[]) => {
      column.setFilterValue(next.length ? next : undefined)
      table.setPageIndex(0)
    }
    const known = new Set(meta.choices.map((c) => c.value))
    // Valeurs présentes en base mais absentes des choix : filtrables quand même.
    const unknown = [...counts.keys()]
      .filter((v): v is string => typeof v === 'string' && !known.has(v))
      .sort((a, b) => a.localeCompare(b, 'fr'))
    const items = [
      ...meta.choices.map((choice, index) => ({
        id: choice.value,
        label: choice.label,
        color: choiceColor(index),
        checked: selected.includes(choice.value),
        count: counts.get(choice.value) ?? 0,
      })),
      ...unknown.map((value) => ({
        id: value,
        label: value,
        checked: selected.includes(value),
        count: counts.get(value) ?? 0,
      })),
      {
        id: EMPTY_CHOICE,
        label: 'Non renseigné',
        checked: selected.includes(EMPTY_CHOICE),
        count: counts.get(undefined) ?? 0,
      },
    ]
    return (
      <DropdownFilter
        key={column.id}
        filters={items}
        triggerLabel={selected.length ? `${label} · ${selected.length}` : label}
        onFilterChange={(id, checked) =>
          setSelected(
            checked ? [...selected, id] : selected.filter((v) => v !== id),
          )
        }
        headerAction={
          selected.length
            ? {
                label: 'Tout effacer',
                icon: RotateCcw,
                onSelect: () => setSelected([]),
              }
            : undefined
        }
      />
    )
  })
}
