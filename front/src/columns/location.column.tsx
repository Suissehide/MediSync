import { createColumnHelper } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'

import EditLocationForm from '../components/custom/popup/editLocationForm.tsx'
import { Button } from '../components/ui/button.tsx'
import type { Location } from '../types/location.ts'

const columnHelper = createColumnHelper<Location>()

type LocationActions = {
  onDelete: (id: string) => void
  // L'écran reste consultable par lecture seule ; sans `referentials:write`,
  // les actions d'écriture ne doivent pas apparaître (le menu n'est pas la
  // seule barrière, une URL se tape à la main).
  canManage: boolean
}

export const getLocationColumns = ({ onDelete, canManage }: LocationActions) => {
  const columns = [
    columnHelper.accessor('name', {
      header: 'Nom',
    }),
  ]

  if (!canManage) {
    return columns
  }

  return [
    ...columns,
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
