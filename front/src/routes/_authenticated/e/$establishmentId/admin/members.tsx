import { createFileRoute, redirect } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'

import { getMemberColumns } from '@/columns/member.column.tsx'
import AddMemberForm from '@/components/custom/popup/addMemberForm.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { can } from '@/hooks/useCan.ts'
import {
  useMemberMutations,
  useMembersQuery,
} from '@/queries/useMembers.ts'
import { useEstablishmentSoignantsQuery } from '@/queries/useSoignant.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { Member } from '@/types/member.ts'
import { resolveEstablishmentContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/admin/members',
)({
  // Le layout `admin` (voir `admin.tsx`) ne fait que poser un contexte sans
  // service ; il n'exige rien de plus que le rôle ADMIN. Cet écran, lui, se
  // garde en plus par `members:manage` — un administrateur d'établissement
  // en a toujours (voir `ESTABLISHMENT_PERMISSIONS`), mais la garde reste
  // explicite ici plutôt qu'implicite au rôle, pour rester correcte si la
  // matrice des habilitations change un jour.
  beforeLoad: ({ context, params }) => {
    const tenant = resolveEstablishmentContext(context.authState.user, params)
    if (!can(tenant, 'members:manage')) {
      throw redirect({ to: '/' })
    }
  },
  component: MemberSettings,
})

function MemberSettings() {
  const context = useAuthStore((state) => state.context)

  const { members, isPending } = useMembersQuery()
  // Prefixe d'etablissement, pas de service : ce layout n'en porte aucun
  // (voir `admin.tsx`), et `useSoignantQueries` (prefixe de service) leverait
  // ici. Voir le commentaire de `useEstablishmentSoignantsQuery`.
  const { soignants } = useEstablishmentSoignantsQuery()
  const { removeMember, deactivateMember, reactivateMember } =
    useMemberMutations()

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)

  const sortedMembers = useMemo(
    () =>
      [...(members ?? [])].sort((a, b) =>
        a.user.email.localeCompare(b.user.email, 'fr'),
      ),
    [members],
  )

  const handleToggleActive = useCallback(
    (member: Member) => {
      if (member.user.deactivatedAt !== null) {
        reactivateMember.mutate(member.id)
      } else {
        deactivateMember.mutate(member.id)
      }
    },
    [deactivateMember, reactivateMember],
  )

  // Les deux mutations de bascule partagent un seul jeu de données pour
  // tout le tableau : on ne fait tourner l'icône de chargement que sur la
  // ligne dont l'identifiant correspond à la mutation en cours.
  const isToggling = useCallback(
    (member: Member) =>
      (deactivateMember.isPending &&
        deactivateMember.variables === member.id) ||
      (reactivateMember.isPending && reactivateMember.variables === member.id),
    [deactivateMember, reactivateMember],
  )

  const columns = useMemo(
    () =>
      getMemberColumns({
        // Ecran sous le layout d'établissement (`admin.tsx`) : le contexte
        // n'y porte jamais de service, `serviceId` vaut toujours `null`.
        serviceId: context?.serviceId ?? null,
        soignants: soignants ?? [],
        onToggleActive: handleToggleActive,
        onRemove: setRemoveTarget,
        isToggling,
      }),
    [context?.serviceId, soignants, handleToggleActive, isToggling],
  )

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Membres de l'établissement
          </h1>
          <AddMemberForm />
        </div>

        <ReactTable<Member>
          data={sortedMembers}
          columns={columns}
          filterId="member"
          isLoading={isPending}
        />

        <ConfirmDeleteForm
          open={removeTarget !== null}
          setOpen={(open) => {
            if (!open) {
              setRemoveTarget(null)
            }
          }}
          onConfirm={() => {
            if (removeTarget) {
              removeMember.mutate(removeTarget.id)
            }
            setRemoveTarget(null)
          }}
          loading={removeMember.isPending}
          title="Retirer le membre"
          description={
            removeTarget
              ? `Voulez-vous vraiment retirer ${removeTarget.user.email} de l'établissement ? Cette action est irréversible.`
              : undefined
          }
        />
      </div>
    </DashboardLayout>
  )
}

export default MemberSettings
