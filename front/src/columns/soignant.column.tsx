import { createColumnHelper } from '@tanstack/react-table'
import { Trash } from 'lucide-react'

import DeleteSoignantForm from '../components/custom/popup/deleteSoignantForm.tsx'
import EditSoignantForm from '../components/custom/popup/editSoignantForm.tsx'
import { Button } from '../components/ui/button.tsx'
import type { Soignant } from '../types/soignant.ts'

const columnHelper = createColumnHelper<Soignant>()

type SoignantColumnOptions = {
  // Sans `soignants:manage`, les actions d'écriture ne doivent pas apparaître
  // (le menu n'est pas la seule barrière, une URL se tape à la main).
  canManage: boolean
}

// Navigation par echelle (2026-09-28) : liste nominative de l'etablissement. La colonne
// Thematiques a disparu avec le demenagement de l'ecran : c'etait une donnee de service, lisible
// seulement sous un service en contexte (voir `editSoignantForm.tsx`).
export const getSoignantColumns = ({ canManage }: SoignantColumnOptions) => {
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
        const soignant = row.original
        return (
          <div className="flex justify-end gap-2">
            <EditSoignantForm soignant={soignant} />
            <DeleteSoignantForm
              soignant={soignant}
              trigger={
                <Button variant="outline" size="icon" aria-label={`Supprimer ${soignant.name}`}>
                  <Trash className="w-4 h-4 text-destructive" />
                </Button>
              }
            />
          </div>
        )
      },
    }),
  ]
}
