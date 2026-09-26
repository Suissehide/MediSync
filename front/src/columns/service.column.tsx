import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { Ban, Pencil, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button.tsx'
import type { Service } from '@/types/service.ts'

const columnHelper = createColumnHelper<Service>()

// PAS de compteur d'impact ici (arbitrage transmis par Léo, task-13-brief.md) :
// la liste des services n'affiche AUCUN compteur en ligne. Les deux nombres
// (`suivisIci`/`suivisNullePartAilleurs`) ne sont lus qu'à la demande, au
// moment de désactiver — voir `services.tsx`.
type ServiceColumnOptions = {
  onRename: (service: Service) => void
  onToggleActive: (service: Service) => void
  isToggling: (service: Service) => boolean
}

export const getServiceColumns = ({
  onRename,
  onToggleActive,
  isToggling,
}: ServiceColumnOptions) => [
  columnHelper.display({
    id: 'name',
    header: 'Nom',
    cell: ({ row }) => row.original.name,
  }),
  columnHelper.display({
    id: 'createdAt',
    header: 'Créé le',
    cell: ({ row }) => dayjs.utc(row.original.createdAt).format('DD/MM/YYYY'),
  }),
  columnHelper.display({
    id: 'status',
    header: 'Statut',
    cell: ({ row }) =>
      row.original.deactivatedAt !== null ? 'Désactivé' : 'Actif',
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    size: 120,
    meta: { align: 'right' },
    cell: ({ row }) => {
      const service = row.original
      const deactivated = service.deactivatedAt !== null
      return (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onRename(service)}
            title="Renommer le service"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onToggleActive(service)}
            isLoading={isToggling(service)}
            title={deactivated ? 'Réactiver le service' : 'Désactiver le service'}
          >
            {deactivated ? (
              <RotateCcw className="w-4 h-4" />
            ) : (
              <Ban className="w-4 h-4 text-orange-600" />
            )}
          </Button>
        </div>
      )
    },
  }),
]
