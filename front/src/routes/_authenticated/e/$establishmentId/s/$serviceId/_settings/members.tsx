import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMemo } from 'react'

import { getServiceMemberColumns } from '@/columns/serviceMember.column.tsx'
import { nomDuCompte } from '@/components/custom/popup/editSoignantAccountsForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { can } from '@/hooks/useCan.ts'
import { useServiceMembersQuery } from '@/queries/useServiceMembers.ts'
import { useSoignantQueries } from '@/queries/useSoignant.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { ServiceMember } from '@/types/serviceMember.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Membres du service (2026-09-29), dans le menu Administration du service. Meme garde que les
// autres ecrans du menu : le coordinateur (`referentials:write`), bien que la lecture de l'API
// soit ouverte a tout membre (`members:read`) — l'ecran releve de l'administration du service.
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/members',
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
  component: ServiceMembers,
})

function ServiceMembers() {
  const { members, isPending } = useServiceMembersQuery()
  const { soignants } = useSoignantQueries()
  const superAdmin = useAuthStore((state) => state.user?.isSuperAdmin === true)

  const sorted = useMemo(
    () =>
      [...(members ?? [])].sort((a, b) =>
        nomDuCompte(a).localeCompare(nomDuCompte(b), 'fr'),
      ),
    [members],
  )
  const columns = useMemo(
    () => getServiceMemberColumns(soignants ?? [], superAdmin),
    [soignants, superAdmin],
  )

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
          Membres du service
        </h1>
        <ReactTable<ServiceMember>
          data={sorted}
          columns={columns}
          filterId="service-members"
          isLoading={isPending}
        />
      </div>
    </DashboardLayout>
  )
}
