import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'

import { getThematicColumns } from '../../../../columns/thematic.column.tsx'
import AddThematicForm from '../../../../components/custom/popup/addThematicForm.tsx'
import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import ReactTable from '../../../../components/table/reactTable.tsx'
import {
  useThematicMutations,
  useThematicQueries,
} from '../../../../queries/useThematic.ts'
import type { Thematic } from '../../../../types/thematic.ts'

export const Route = createFileRoute(
  '/_authenticated/_admin/settings/thematic',
)({
  component: ThematicSettings,
})

function ThematicSettings() {
  const { thematics } = useThematicQueries()
  const { deleteThematic } = useThematicMutations()

  const sortedThematics = useMemo(
    () =>
      [...(thematics ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [thematics],
  )

  const columns = getThematicColumns({
    onDelete: (id) => deleteThematic.mutate(id),
  })

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Thématiques
          </h1>
          <AddThematicForm />
        </div>

        <ReactTable<Thematic>
          data={sortedThematics}
          columns={columns}
          filterId="thematic"
        />
      </div>
    </DashboardLayout>
  )
}
