import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { getLocationColumns } from '../../../../columns/location.column.tsx'
import AddLocationForm from '../../../../components/custom/popup/addLocationForm.tsx'
import { ConfirmDeleteForm } from '../../../../components/custom/popup/confirmDeleteForm.tsx'
import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import ReactTable from '../../../../components/table/reactTable.tsx'
import {
  useLocationMutations,
  useLocationQueries,
} from '../../../../queries/useLocation.ts'
import type { Location } from '../../../../types/location.ts'

export const Route = createFileRoute(
  '/_authenticated/_admin/settings/location',
)({
  component: LocationSettings,
})

function LocationSettings() {
  const { locations, isPending } = useLocationQueries()
  const { deleteLocation } = useLocationMutations()
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const sortedLocations = useMemo(
    () =>
      [...(locations ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [locations],
  )

  const columns = useMemo(
    () =>
      getLocationColumns({
        onDelete: (id) => setDeleteTargetId(id),
      }),
    [],
  )

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Salles
          </h1>
          <AddLocationForm />
        </div>

        <ReactTable<Location>
          data={sortedLocations}
          columns={columns}
          filterId="location"
          isLoading={isPending}
        />

        <ConfirmDeleteForm
          open={!!deleteTargetId}
          setOpen={(open) => {
            if (!open) {
              setDeleteTargetId(null)
            }
          }}
          onConfirm={() => {
            if (deleteTargetId) {
              deleteLocation.mutate(deleteTargetId)
            }
            setDeleteTargetId(null)
          }}
          loading={deleteLocation.isPending}
          title="Supprimer la salle"
          description="Voulez-vous vraiment supprimer cette salle ? Cette action est irréversible."
        />
      </div>
    </DashboardLayout>
  )
}
