import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { getThematicColumns } from '../../../../columns/thematic.column.tsx'
import AddThematicForm from '../../../../components/custom/popup/addThematicForm.tsx'
import { ConfirmDeleteForm } from '../../../../components/custom/popup/confirmDeleteForm.tsx'
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
  const { thematics, isPending } = useThematicQueries()
  const { deleteThematic } = useThematicMutations()
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const sortedThematics = useMemo(
    () =>
      [...(thematics ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [thematics],
  )

  const columns = getThematicColumns({
    onDelete: (id) => setDeleteTargetId(id),
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
          isLoading={isPending}
        />

        <ConfirmDeleteForm
          open={!!deleteTargetId}
          setOpen={(open) => { if (!open) setDeleteTargetId(null) }}
          onConfirm={() => {
            if (deleteTargetId) deleteThematic.mutate(deleteTargetId)
            setDeleteTargetId(null)
          }}
          loading={deleteThematic.isPending}
          title="Supprimer la thématique"
          description="Voulez-vous vraiment supprimer cette thématique ? Cette action est irréversible."
        />
      </div>
    </DashboardLayout>
  )
}
