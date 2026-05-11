import { createColumnHelper } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'

import EditThematicSoignantsForm from '../components/custom/popup/editThematicSoignantsForm.tsx'
import { Button } from '../components/ui/button.tsx'
import type { Thematic } from '../types/thematic.ts'

const columnHelper = createColumnHelper<Thematic>()

type ThematicActions = {
  onDelete: (id: string) => void
  soignantOptions: { value: string; label: string }[]
}

export const getThematicColumns = ({ onDelete, soignantOptions }: ThematicActions) => {
  return [
    columnHelper.accessor('name', {
      header: 'Nom',
    }),
    columnHelper.display({
      id: 'duration',
      header: 'Durée',
      size: 120,
      cell: ({ row }) => {
        const duration = row.original.duration
        return duration
          ? `${duration} minutes`
          : '—'
      },
    }),
    columnHelper.display({
      id: 'soignants',
      header: 'Soignants',
      size: 300,
      cell: ({ row }) => {
        const soignants = row.original.soignants
        const visible = soignants.slice(0, 3)
        const rest = soignants.length - visible.length
        return (
          <div className="flex items-center gap-1 overflow-hidden">
            {visible.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                {s.name}
              </span>
            ))}
            {rest > 0 && (
              <span className="shrink-0 text-xs text-muted-foreground font-medium">
                +{rest}
              </span>
            )}
          </div>
        )
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      size: 60,
      cell: ({ row }) => {
        const thematic = row.original
        return (
          <div className="flex justify-end gap-2">
            <EditThematicSoignantsForm
              thematic={thematic}
              soignantOptions={soignantOptions}
            />
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
