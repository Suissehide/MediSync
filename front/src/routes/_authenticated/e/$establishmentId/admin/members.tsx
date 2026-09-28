import { createFileRoute, redirect } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'

import { getMemberColumns } from '@/columns/member.column.tsx'
import AddMemberForm from '@/components/custom/popup/addMemberForm.tsx'
import { ConfirmDeleteForm } from '@/components/custom/popup/confirmDeleteForm.tsx'
import CreateMemberAccountForm from '@/components/custom/popup/createMemberAccountForm.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { can } from '@/hooks/useCan.ts'
import { queryState } from '@/libs/queryState.ts'
import {
  useMemberMutations,
  useMembersQuery,
} from '@/queries/useMembers.ts'
import { useServicesQuery } from '@/queries/useServices.ts'
import { useEstablishmentSoignantsQuery } from '@/queries/useSoignant.ts'
import type { Member } from '@/types/member.ts'
import { resolveEstablishmentContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/admin/members',
)({
  // Le layout `admin` (voir `admin.tsx`) exige DÉJÀ le rôle ADMIN — via
  // `resolveEstablishmentContext` (`utils/tenant-context.ts`), qui renvoie
  // `null` si `establishment.role !== 'ADMIN'` et fait alors rediriger vers
  // `/choose-context` AVANT que cette feuille ne soit atteinte (un MEMBER
  // n'y arrive jamais, voir `admin.test.ts`, « refuse un membre sans role
  // ADMIN sur cet etablissement »). Cet écran se garde donc EN PLUS,
  // explicitement, par `members:manage` — un administrateur d'établissement
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

  const { members, isPending, error } = useMembersQuery()
  // Prefixe d'etablissement, pas de service : ce layout n'en porte aucun
  // (voir `admin.tsx`), et `useSoignantQueries` (prefixe de service) leverait
  // ici. Voir le commentaire de `useEstablishmentSoignantsQuery`.
  const { soignants } = useEstablishmentSoignantsQuery()
  // Même requête que l'onglet des services (`admin/services.tsx`) : sert à
  // résoudre le NOM d'un service pour la colonne « Rôle service »
  // (`member.column.tsx`, tour de correction 1, Important n°2) — sans
  // état de chargement/erreur dédié ici, même précédent que `soignants`
  // ci-dessus (une liste absente ou pas encore chargée retombe sur `[]`,
  // et la colonne affiche alors le rôle sans le nom plutôt que rien).
  const { services } = useServicesQuery()
  const { removeMember, deactivateMember, reactivateMember } =
    useMemberMutations()

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)

  // Important n°4 (tour de correction 1, tâche 13) : sans ceci, un 500 sur
  // `GET /members` laisse `members` à `undefined` et le tableau se
  // contente d'un rendu vide, indiscernable de « aucun membre » une fois le
  // toast disparu (`useDataFetching` en pose un, mais il s'efface). Même
  // leçon que `services.tsx`/`grants.tsx` (et déjà tirée à la tâche 12) :
  // distinguer chargement / erreur / prêt, jamais laisser l'un se faire
  // passer pour l'autre.
  const etat = queryState({ isPending, error, hasData: members !== undefined })

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
        services: services ?? [],
        soignants: soignants ?? [],
        onToggleActive: handleToggleActive,
        onRemove: setRemoveTarget,
        isToggling,
      }),
    [services, soignants, handleToggleActive, isToggling],
  )

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">

        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Membres de l'établissement
          </h1>
          <div className="flex gap-2">
            <CreateMemberAccountForm />
            <AddMemberForm />
          </div>
        </div>

        {etat === 'pending' && (
          <div className="flex-1 flex items-center justify-center text-text-light">
            Chargement...
          </div>
        )}

        {(etat === 'error' || etat === 'empty') && (
          <div className="flex-1 flex items-center justify-center text-text-light">
            Impossible de charger les membres. Réessayez plus tard.
          </div>
        )}

        {etat === 'ready' && (
          <ReactTable<Member>
            data={sortedMembers}
            columns={columns}
            filterId="member"
            emptyState={
              <div className="text-sm text-text-light py-6 text-center">
                Aucun membre pour le moment.
              </div>
            }
          />
        )}

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
