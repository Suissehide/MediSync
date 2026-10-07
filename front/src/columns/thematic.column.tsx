import { createColumnHelper } from '@tanstack/react-table'
import { Archive, Undo2 } from 'lucide-react'

import EditThematicSoignantsForm from '../components/custom/popup/editThematicSoignantsForm.tsx'
import { Etiquette } from '../components/table/etiquette.tsx'
import { Button } from '../components/ui/button.tsx'
import type { Thematic } from '../types/thematic.ts'

const columnHelper = createColumnHelper<Thematic>()

type ThematicActions = {
  onArchive: (id: string) => void
  onRestore: (id: string) => void
  // Les archivees se consultent dans la meme table : seules les actions
  // changent, une archivee ne se reedite pas.
  archived: boolean
  soignantOptions: { value: string; label: string }[]
  // L'écran reste consultable par lecture seule ; sans `referentials:write`,
  // les actions d'écriture ne doivent pas apparaître (le menu n'est pas la
  // seule barrière, une URL se tape à la main).
  canManage: boolean
}

export const getThematicColumns = ({
  onArchive,
  onRestore,
  archived,
  soignantOptions,
  canManage,
}: ThematicActions) => {
  const columns = [
    columnHelper.accessor('name', {
      header: 'Nom',
    }),
    columnHelper.display({
      id: 'duration',
      header: 'Durée',
      size: 120,
      cell: ({ row }) => {
        const duration = row.original.duration
        return duration ? `${duration} minutes` : '—'
      },
    }),
    columnHelper.display({
      id: 'pdfNotice',
      header: 'Consigne PDF',
      size: 280,
      cell: ({ row }) => {
        const notice = row.original.pdfNotice
        if (!notice) {
          return '—'
        }
        // Le tableau ne tient pas compte de `size` : sans largeur explicite,
        // une consigne de plusieurs lignes repousse les colonnes suivantes
        // hors de l'écran.
        return (
          <span
            className="block max-w-[280px] truncate text-text-light"
            title={notice}
          >
            {notice}
          </span>
        )
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
              <Etiquette key={s.id}>{s.name}</Etiquette>
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
        const thematic = row.original
        if (archived) {
          return (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="icon"
                title="Restaurer"
                onClick={() => onRestore(thematic.id)}
              >
                <Undo2 className="w-3 h-3" />
              </Button>
            </div>
          )
        }
        return (
          <div className="flex justify-end gap-2">
            <EditThematicSoignantsForm
              thematic={thematic}
              soignantOptions={soignantOptions}
            />
            <Button
              variant="outline"
              size="icon"
              title="Archiver"
              onClick={() => onArchive(thematic.id)}
            >
              <Archive className="w-3 h-3 text-destructive" />
            </Button>
          </div>
        )
      },
    }),
  ]
}
