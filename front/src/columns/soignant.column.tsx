import { createColumnHelper } from '@tanstack/react-table'
import { Trash } from 'lucide-react'

import DeleteSoignantForm from '../components/custom/popup/deleteSoignantForm.tsx'
import EditSoignantThematicsForm from '../components/custom/popup/editSoignantThematicsForm.tsx'
import { Button } from '../components/ui/button.tsx'
import type { Soignant } from '../types/soignant.ts'
import type { Thematic } from '../types/thematic.ts'

const columnHelper = createColumnHelper<Soignant>()

type SoignantColumnOptions = {
  thematics: Thematic[]
  thematicOptions: { value: string; label: string }[]
}

export const getSoignantColumns = ({
  thematics,
  thematicOptions,
}: SoignantColumnOptions) => {
  return [
    columnHelper.accessor('name', {
      header: 'Nom',
    }),
    columnHelper.display({
      id: 'thematics',
      header: 'Thématiques',
      cell: ({ row }) => {
        const soignant = row.original
        const soignantThematics = thematics
          .filter((t) => t.soignants.some((s) => s.id === soignant.id))
          .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        return (
          <div className="flex flex-wrap gap-1">
            {soignantThematics.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                {t.name}
              </span>
            ))}
          </div>
        )
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      size: 60,
      cell: ({ row }) => {
        const soignant = row.original
        return (
          <div className="flex justify-end gap-2">
            <EditSoignantThematicsForm
              soignant={soignant}
              thematics={thematics}
              thematicOptions={thematicOptions}
            />
            <DeleteSoignantForm
              soignant={soignant}
              trigger={
                <Button variant="outline" size="icon">
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
