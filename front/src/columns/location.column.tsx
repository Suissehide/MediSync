import { createColumnHelper } from '@tanstack/react-table'
import { Archive, Undo2 } from 'lucide-react'

import EditLocationForm from '../components/custom/popup/editLocationForm.tsx'
import { Button } from '../components/ui/button.tsx'
import type { Location } from '../types/location.ts'

const columnHelper = createColumnHelper<Location>()

type LocationActions = {
  onArchive: (id: string) => void
  onRestore: (id: string) => void
  // Les archivees se consultent dans la meme table : seules les actions
  // changent, une archivee ne se reedite pas.
  archived: boolean
  // L'écran reste consultable par lecture seule ; sans `referentials:write`,
  // les actions d'écriture ne doivent pas apparaître (le menu n'est pas la
  // seule barrière, une URL se tape à la main).
  canManage: boolean
}

export const getLocationColumns = ({
  onArchive,
  onRestore,
  archived,
  canManage,
}: LocationActions) => {
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
        if (archived) {
          return (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="icon"
                title="Restaurer"
                onClick={() => onRestore(location.id)}
              >
                <Undo2 className="w-3 h-3" />
              </Button>
            </div>
          )
        }
        return (
          <div className="flex justify-end gap-2">
            <EditLocationForm location={location} />
            <Button
              variant="outline"
              size="icon"
              title="Archiver"
              onClick={() => onArchive(location.id)}
            >
              <Archive className="w-3 h-3 text-destructive" />
            </Button>
          </div>
        )
      },
    }),
  ]
}
