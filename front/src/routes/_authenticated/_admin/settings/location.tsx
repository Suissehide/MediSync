import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { getLocationColumns } from '../../../../columns/location.column.tsx'
import AddLocationForm from '../../../../components/custom/popup/addLocationForm.tsx'
import { ConfirmDeleteForm } from '../../../../components/custom/popup/confirmDeleteForm.tsx'
import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import ReactTable from '../../../../components/table/reactTable.tsx'
import { useCan } from '../../../../hooks/useCan.ts'
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
  // Le menu ne montre cette page qu'aux détenteurs de `locations:manage`,
  // mais l'URL se tape à la main : les actions d'écriture se gardent aussi
  // ici, indépendamment du menu.
  const canManage = useCan('locations:manage')
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
        canManage,
      }),
    [canManage],
  )

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Salles
          </h1>
          {canManage && <AddLocationForm />}
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
