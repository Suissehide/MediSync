import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { getServiceMemberColumns } from '@/columns/serviceMember.column.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import { nomDuCompte } from '@/components/custom/popup/editSoignantAccountsForm.tsx'
import InviteServiceMemberForm from '@/components/custom/popup/inviteServiceMemberForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { can } from '@/hooks/useCan.ts'
import {
  useServiceMemberMutations,
  useServiceMembersQuery,
} from '@/queries/useServiceMembers.ts'
import { useSoignantQueries } from '@/queries/useSoignant.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { ServiceMember } from '@/types/serviceMember.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Membres du service (2026-09-29), dans le menu Administration du service. Garde par
// `service-members:manage` depuis MDS-17 : c'est devenu l'ecran ou l'equipe se gere (inviter,
// changer le role de service, retirer), et non plus seulement la liste de qui y travaille. La
// lecture de l'API reste ouverte a tout membre du service (`members:read`).
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/members',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'service-members:manage')) {
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
  const soiMeme = useAuthStore((state) => state.user?.id)
  const { removeMember } = useServiceMemberMutations()
  const [cibleRetrait, setCibleRetrait] = useState<ServiceMember | null>(null)

  const sorted = useMemo(
    () =>
      [...(members ?? [])].sort((a, b) =>
        nomDuCompte(a).localeCompare(nomDuCompte(b), 'fr'),
      ),
    [members],
  )
  const columns = useMemo(
    () =>
      getServiceMemberColumns({
        soignants: soignants ?? [],
        avecIdentifiant: superAdmin,
        soiMeme,
        onRemove: setCibleRetrait,
      }),
    [soignants, superAdmin, soiMeme],
  )

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Membres du service
          </h1>
          <InviteServiceMemberForm />
        </div>
        <ReactTable<ServiceMember>
          data={sorted}
          columns={columns}
          filterId="service-members"
          isLoading={isPending}
        />

        <ConfirmDeleteForm
          open={cibleRetrait !== null}
          setOpen={(open) => {
            if (!open) {
              setCibleRetrait(null)
            }
          }}
          onConfirm={() => {
            if (cibleRetrait) {
              removeMember.mutate(cibleRetrait.id)
            }
            setCibleRetrait(null)
          }}
          loading={removeMember.isPending}
          title="Retirer du service"
          description={
            cibleRetrait
              ? `Voulez-vous vraiment retirer ${cibleRetrait.user.email} de ce service ? Son compte et ses autres services ne sont pas touchés.`
              : undefined
          }
        />
      </div>
    </DashboardLayout>
  )
}
