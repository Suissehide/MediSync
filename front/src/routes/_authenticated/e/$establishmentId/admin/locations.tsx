import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { getLocationColumns } from '@/columns/location.column.tsx'
import AddLocationForm from '@/components/custom/popup/addLocationForm.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { can, useCan } from '@/hooks/useCan.ts'
import { useEstablishmentLocationsQuery, useLocationMutations } from '@/queries/useLocation.ts'
import type { Location } from '@/types/location.ts'
import { resolveEstablishmentContext } from '@/utils/tenant-context.ts'

// Navigation par echelle (2026-09-28) : les salles sont une donnee d'etablissement
// (`Location.establishmentId`) gardee par `locations:manage` (ADMIN). L'ecran vivait sous un
// service ; il vit desormais a l'echelle de l'etablissement, joignable sans affectation de
// service.
export const Route = createFileRoute('/_authenticated/e/$establishmentId/admin/locations')({
  // Meme garde explicite que `members.tsx`.
  beforeLoad: ({ context, params }) => {
    const tenant = resolveEstablishmentContext(context.authState.user, params)
    if (!can(tenant, 'locations:manage')) {
      throw redirect({ to: '/' })
    }
  },
  component: EstablishmentLocations,
})

function EstablishmentLocations() {
  const canManage = useCan('locations:manage')
  const { locations, isPending } = useEstablishmentLocationsQuery()
  const { deleteLocation } = useLocationMutations()
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const sortedLocations = useMemo(
    () => [...(locations ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
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
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">Salles</h1>
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
