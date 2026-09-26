import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { superAdminEstablishmentColumns } from '@/columns/superAdminEstablishment.column.tsx'
import CreateEstablishmentForm from '@/components/custom/popup/createEstablishmentForm.tsx'
import { SuperAdminNav } from '@/components/custom/superAdmin/superAdminNav.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import ReactTable from '@/components/table/reactTable.tsx'
import { useSuperAdminEstablishmentsQuery } from '@/queries/useSuperAdmin.ts'
import type { EstablishmentListItem } from '@/types/superAdmin.ts'

// Task-12-brief.md, step 1 : « la liste, avec les colonnes de la décision
// 3.3 et les identifiants copiables ». Écran hors de tout tenant : voir
// `../super-admin.tsx`, le layout parent qui pose la seule garde
// (`isSuperAdmin`).
export const Route = createFileRoute('/_authenticated/super-admin/')({
  component: SuperAdminEstablishmentsList,
})

function SuperAdminEstablishmentsList() {
  const navigate = useNavigate()
  const { establishments, isPending, error } = useSuperAdminEstablishmentsQuery()

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Établissements
          </h1>
          <CreateEstablishmentForm />
        </div>
        <SuperAdminNav />

        {/* Tour de correction 1, Important n°4 : une erreur de chargement
        rendait un tableau vide, indiscernable d'un « aucun établissement »
        réel (`establishments ?? []` retombe sur le même tableau vide dans
        les deux cas). L'erreur est désormais affichée à part, avant même
        d'atteindre `ReactTable` — qui garde la distinction chargement/vide
        qu'il tenait déjà correctement pour ces deux-là. */}
        {error ? (
          <p className="text-sm text-destructive">
            Impossible de charger les établissements. Réessayez plus tard.
          </p>
        ) : (
          <ReactTable<EstablishmentListItem>
            data={establishments ?? []}
            columns={superAdminEstablishmentColumns}
            filterId="super-admin-establishments"
            isLoading={isPending}
            onRowClick={(row) =>
              navigate({
                to: '/super-admin/$establishmentId',
                params: { establishmentId: row.id },
              })
            }
          />
        )}
      </div>
    </DashboardLayout>
  )
}

export default SuperAdminEstablishmentsList
