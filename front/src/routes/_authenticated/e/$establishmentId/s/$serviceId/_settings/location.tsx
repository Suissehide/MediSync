import { createFileRoute, redirect } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getLocationColumns } from '@/columns/location.column.tsx'
import AddLocationForm from '@/components/custom/popup/addLocationForm.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { Input } from '@/components/ui/input.tsx'
import { can, useCan } from '@/hooks/useCan.ts'
import {
  useLocationMutations,
  useLocationQueries,
} from '@/queries/useLocation.ts'
import type { Location } from '@/types/location.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/location',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'referentials:write')) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: LocationSettings,
})

function LocationSettings() {
  // Le menu ne montre cette page qu'aux détenteurs de `referentials:write` (le coordinateur),
  // mais l'URL se tape à la main : les actions d'écriture se gardent aussi
  // ici, indépendamment du menu.
  const canManage = useCan('referentials:write')
  const { locations, isPending } = useLocationQueries()
  const { deleteLocation } = useLocationMutations()
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')

  const sortedLocations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return (locations ?? [])
      .filter((x) => !term || x.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [locations, searchTerm])

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
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Salles
          </h1>
          <div className="flex items-center gap-3">
            <Input
              iconLeft={<Search className="w-4 h-4" />}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nom de la salle..."
              className="w-72"
            />
            {canManage && <AddLocationForm />}
          </div>
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
