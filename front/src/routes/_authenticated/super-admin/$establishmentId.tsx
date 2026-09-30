import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Pencil } from 'lucide-react'
import { useState } from 'react'

import { activityLogColumns } from '@/columns/activityLog.column.tsx'
import { CopyableId } from '@/components/custom/copyableId.tsx'
import CreateGrantForm from '@/components/custom/popup/createGrantForm.tsx'
import RenameEstablishmentForm from '@/components/custom/popup/renameEstablishmentForm.tsx'
import { ActiveGrantNotice } from '@/components/custom/superAdmin/activeGrantNotice.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { EtiquetteStatut } from '@/components/table/etiquette.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { Button } from '@/components/ui/button.tsx'
import { queryState } from '@/libs/queryState.ts'
import {
  useSuperAdminEstablishmentActivityLogQuery,
  useSuperAdminEstablishmentQuery,
  useSuperAdminRenameEstablishment,
} from '@/queries/useSuperAdmin.ts'
import type { ActivityLog } from '@/types/activityLog.ts'

const ESTABLISHMENT_ROLE_LABEL: Record<string, string> = {
  ADMIN: "Chef d'établissement",
  MEMBER: 'Membre',
}

// Pagination côté serveur du journal (2026-10-01) : il arrivait dans la réponse
// du détail, borné à 100 lignes, sans rien pour aller au-delà ni même pour
// savoir qu'il y avait un au-delà. Même taille de première page que les deux
// autres journaux du dépôt.
const PREMIERE_PAGE = { pageIndex: 0, pageSize: 25 }

// « Le détail d'un établissement — services,
// membres, journal, bouton d'octroi avec motif obligatoire et durée ».
// Écran hors de tout tenant : voir `../super-admin.tsx`.
export const Route = createFileRoute(
  '/_authenticated/super-admin/$establishmentId',
)({
  component: SuperAdminEstablishmentDetail,
})

function SuperAdminEstablishmentDetail() {
  const navigate = useNavigate()
  const [renommer, setRenommer] = useState(false)
  const renameEstablishment = useSuperAdminRenameEstablishment()
  const [pagination, setPagination] = useState(PREMIERE_PAGE)
  // Le paramètre de route DÉSIGNE l'établissement demandé (§6.2) : ce n'est
  // pas ici un tenant implicite, il n'est jamais posé dans le store
  // (`setContext`) ni utilisé par une fabrique d'URL de tenant — voir le
  // commentaire de tête de `super-admin.tsx`.
  const { establishmentId } = useParams({
    from: '/_authenticated/super-admin/$establishmentId',
  })
  const { establishment, isPending, error } =
    useSuperAdminEstablishmentQuery(establishmentId)
  // Requête séparée du détail : changer de page ne relit ni les services, ni
  // les membres, ni les compteurs.
  const { data: journal, isPending: journalEnCours } =
    useSuperAdminEstablishmentActivityLogQuery(establishmentId, {
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
    })

  // Avec `retry: 0`, une requête en
  // échec repasse `isPending` à `false` sans jamais poser `establishment` —
  // une garde `isPending || !establishment` restait donc vraie pour
  // toujours devant une vraie erreur (identifiant supprimé ou mal
  // recopié, back injoignable), affichant un « Chargement... » perpétuel
  // qui ne dit rien à l'appelant. `queryState` distingue les trois cas.
  const etat = queryState({
    isPending,
    error,
    hasData: establishment !== undefined,
  })

  if (etat === 'pending') {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center text-text-light">
          Chargement...
        </div>
      </DashboardLayout>
    )
  }

  if (etat === 'error' || etat === 'empty' || !establishment) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-light">
          <p>
            Impossible de charger cet établissement. Vérifiez l'identifiant ou
            réessayez.
          </p>
          <Button
            variant="outline"
            onClick={() => navigate({ to: '/super-admin' })}
          >
            <ArrowLeft className="w-4 h-4" />
            Retour à la liste
          </Button>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-6 overflow-auto">
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-start gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate({ to: '/super-admin' })}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-text-dark">
                  {establishment.name}
                </h1>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setRenommer(true)}
                  title="Renommer l'établissement"
                  aria-label="Renommer l'établissement"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
              <CopyableId value={establishment.id} />
            </div>
          </div>
          <CreateGrantForm establishmentId={establishment.id} />
        </div>

        <RenameEstablishmentForm
          establishment={renommer ? establishment : null}
          onClose={() => setRenommer(false)}
          rename={renameEstablishment}
        />

        <ActiveGrantNotice establishmentId={establishment.id} />

        <section>
          <h2 className="text-sm font-semibold text-text-light uppercase mb-2">
            Services
          </h2>
          {establishment.services.length === 0 ? (
            <p className="text-sm text-text-light">Aucun service</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {establishment.services.map((service) => (
                <li
                  key={service.id}
                  className="flex justify-between border-b border-border py-1 text-sm"
                >
                  <span>{service.name}</span>
                  <EtiquetteStatut deactivatedAt={service.deactivatedAt} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-text-light uppercase mb-2">
            Membres
          </h2>
          {establishment.members.length === 0 ? (
            <p className="text-sm text-text-light">Aucun membre</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {establishment.members.map((member) => (
                <li
                  key={member.id}
                  className="flex justify-between border-b border-border py-1 text-sm"
                >
                  <span>
                    {[member.firstName, member.lastName]
                      .filter(Boolean)
                      .join(' ') || member.email}{' '}
                    <span className="text-text-light">({member.email})</span>
                  </span>
                  <span className="text-text-light">
                    {ESTABLISHMENT_ROLE_LABEL[member.role] ?? member.role}
                    {member.deactivatedAt !== null ? ' — désactivé' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex-1 min-h-0 flex flex-col">
          <h2 className="text-sm font-semibold text-text-light uppercase mb-2">
            Journal d'activité
          </h2>
          <ReactTable<ActivityLog>
            data={journal?.data ?? []}
            columns={activityLogColumns}
            serverPagination={{
              ...pagination,
              rowCount: journal?.total ?? 0,
              onChange: setPagination,
            }}
            filterId="super-admin-establishment-activity-log"
            isLoading={journalEnCours}
          />
        </section>
      </div>
    </DashboardLayout>
  )
}

export default SuperAdminEstablishmentDetail
