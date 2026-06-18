import { createColumnHelper } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'

import EditLocationForm from '../components/custom/popup/editLocationForm.tsx'
import { Button } from '../components/ui/button.tsx'
import type { Location } from '../types/location.ts'

const columnHelper = createColumnHelper<Location>()

type LocationActions = {
  onDelete: (id: string) => void
}

export const getLocationColumns = ({ onDelete }: LocationActions) => {
  return [
    columnHelper.accessor('name', {
      header: 'Nom',
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      size: 60,
      meta: { align: 'right' },
      cell: ({ row }) => {
        const location = row.original
        return (
          <div className="flex justify-end gap-2">
            <EditLocationForm location={location} />
            <Button
              variant="outline"
              size="icon"
              onClick={() => onDelete(location.id)}
            >
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          </div>
        )
      },
    }),
  ]
}
