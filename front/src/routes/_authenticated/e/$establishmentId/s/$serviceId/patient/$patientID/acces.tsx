import { createFileRoute, redirect, useParams } from '@tanstack/react-router'

import { getAccessLogColumns } from '@/columns/accessLog.column.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { ReactTable } from '@/components/table/reactTable.tsx'
import { can } from '@/hooks/useCan.ts'
import { queryState } from '@/libs/queryState.ts'
import { usePatientAccessLogQuery } from '@/queries/useAccessLog.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { PatientAccessLogEntry } from '@/types/accessLog.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Le journal des accès à UN
// dossier patient, à l'échelle du service courant (`GET /e/:establishmentId/s/:serviceId/patient/
// :patientID/acces`). Réservé à `consultations:read` (rôle COORDINATEUR
// uniquement, `utils/permissions.ts`) : même garde, même redirection que `activity-log.tsx`
// (vers le tableau de bord, pas `/choose-context` — le contexte lui-même reste valide, seule la
// permission manque).
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/patient/$patientID/acces',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'consultations:read')) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: PatientAccessLogPage,
})

function PatientAccessLogPage() {
  const { establishmentId, patientID } = useParams({
    from: '/_authenticated/e/$establishmentId/s/$serviceId/patient/$patientID/acces',
  })
  const { entries, isPending, error } = usePatientAccessLogQuery(patientID)

  // Résout `serviceId` en nom lisible pour la colonne « Service » (`columns/accessLog.column.tsx`) :
  // la liste des services de CET établissement vient déjà de la session (`GET /me`), aucune
  // requête supplémentaire n'est nécessaire pour ce seul affichage.
  const user = useAuthStore((state) => state.user)
  const services =
    user?.establishments.find(
      (establishment) => establishment.id === establishmentId,
    )?.services ?? []

  const etat = queryState({ isPending, error, hasData: entries !== undefined })

  const columns = getAccessLogColumns({ services })

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex items-center justify-between">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Consultations du dossier
          </h1>
        </div>

        {etat === 'pending' && (
          <div className="flex-1 flex items-center justify-center text-text-light">
            Chargement...
          </div>
        )}

        {(etat === 'error' || etat === 'empty') && (
          <div className="flex-1 flex items-center justify-center text-text-light">
            Impossible de charger le journal des accès. Réessayez plus tard.
          </div>
        )}

        {etat === 'ready' && entries && (
          <ReactTable<PatientAccessLogEntry>
            data={entries}
            columns={columns}
            filterId="patient-access-log"
            emptyState={
              <div className="text-sm text-text-light py-6 text-center">
                Aucun accès enregistré pour ce dossier.
              </div>
            }
          />
        )}
      </div>
    </DashboardLayout>
  )
}

export default PatientAccessLogPage
