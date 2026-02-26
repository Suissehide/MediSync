import { createColumnHelper } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'

import { Button } from '../components/ui/button.tsx'
import type { Thematic } from '../types/thematic.ts'

const columnHelper = createColumnHelper<Thematic>()

type ThematicActions = {
  onDelete: (id: string) => void
}

export const getThematicColumns = ({ onDelete }: ThematicActions) => {
  return [
    columnHelper.accessor('name', {
      header: 'Nom',
    }),
    columnHelper.accessor(
      (row) => row.soignants.map((s) => s.name).join(', '),
      {
        id: 'soignants',
        header: 'Soignants',
      },
    ),
    columnHelper.display({
      id: 'actions',
      header: '',
      size: 40,
      cell: ({ row }) => {
        const thematic = row.original
        return (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onDelete(thematic.id)}
            >
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          </div>
        )
      },
    }),
  ]
}
