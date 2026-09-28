import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMemo } from 'react'

import { getSoignantColumns } from '@/columns/soignant.column.tsx'
import { AddEstablishmentSoignantForm } from '@/components/custom/popup/addSoignantForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { can, useCan } from '@/hooks/useCan.ts'
import { useEstablishmentSoignantsQuery } from '@/queries/useSoignant.ts'
import type { Soignant } from '@/types/soignant.ts'
import { resolveEstablishmentContext } from '@/utils/tenant-context.ts'

// Navigation par echelle (2026-09-28) : les soignants sont une donnee d'etablissement
// (`Soignant.establishmentId`, sans service) et leur gestion une prerogative d'etablissement
// (`soignants:manage`, ADMIN). L'ecran vivait sous un service, ce qui le rendait inaccessible a
// un administrateur sans affectation de service ; il vit desormais ici. Le rattachement aux
// thematiques, donnee de service, reste dans l'ecran Thematiques de chaque service.
export const Route = createFileRoute('/_authenticated/e/$establishmentId/admin/soignants')({
  // Meme garde explicite que `members.tsx` : le layout `admin` exige deja le role ADMIN, la
  // permission est verifiee en plus pour rester juste si la matrice change.
  beforeLoad: ({ context, params }) => {
    const tenant = resolveEstablishmentContext(context.authState.user, params)
    if (!can(tenant, 'soignants:manage')) {
      throw redirect({ to: '/' })
    }
  },
  component: EstablishmentSoignants,
})

function EstablishmentSoignants() {
  const canManage = useCan('soignants:manage')
  const { soignants, isPending } = useEstablishmentSoignantsQuery()

  const sortedSoignants = useMemo(
    () => [...(soignants ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [soignants],
  )

  const columns = useMemo(() => getSoignantColumns({ canManage }), [canManage])

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-start gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">Soignants</h1>
            <p className="text-sm text-text-light">
              Liste commune à tout l'établissement. Le rattachement aux thématiques se fait dans
              chaque service, depuis Thématiques.
            </p>
          </div>
          {canManage && <AddEstablishmentSoignantForm />}
        </div>

        <ReactTable<Soignant>
          data={sortedSoignants}
          columns={columns}
          filterId="soignant"
          isLoading={isPending}
        />
      </div>
    </DashboardLayout>
  )
}
