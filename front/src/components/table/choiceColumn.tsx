import type { ColumnDef, FilterFn } from '@tanstack/react-table'

import { choiceColor } from '../../libs/choicePalette.ts'
import { Etiquette } from './etiquette.tsx'

export type Choice = { value: string; label: string }

// Valeur de filtre qui retient les lignes sans valeur (« Non renseigné »).
export const EMPTY_CHOICE = '__empty__'

export const choiceLabel = (choices: Choice[], value: string) =>
  choices.find((c) => c.value === value)?.label ?? value

export const matchesChoice = (value: string | undefined, selected: string[]) =>
  selected.includes(value ?? EMPTY_CHOICE)

export function choiceColumn<TData>(
  id: string,
  accessor: (row: TData) => string | null | undefined,
  options: { label: string; group?: string; choices: Choice[] },
): ColumnDef<TData, string | undefined> {
  const { label, group, choices } = options
  const indexOf = new Map(choices.map((c, i) => [c.value, i]))

  const filterFn: FilterFn<TData> = (row, columnId, selected: string[]) =>
    matchesChoice(row.getValue<string | undefined>(columnId), selected)
  filterFn.autoRemove = (v) => !Array.isArray(v) || v.length === 0

  return {
    id,
    accessorFn: (row) => accessor(row) ?? undefined,
    header: label,
    sortUndefined: 'last',
    sortingFn: (a, b, columnId) =>
      choiceLabel(choices, a.getValue<string>(columnId)).localeCompare(
        choiceLabel(choices, b.getValue<string>(columnId)),
        'fr',
      ),
    filterFn,
    cell: ({ getValue }) => {
      const value = getValue()
      if (!value) {
        return null
      }
      const index = indexOf.get(value)
      return (
        <Etiquette
          ton="neutre"
          couleur={index === undefined ? undefined : choiceColor(index)}
        >
          {choiceLabel(choices, value)}
        </Etiquette>
      )
    },
    meta: { optional: { label, group }, choices },
  }
}
