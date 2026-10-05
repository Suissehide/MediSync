import { createFileRoute, redirect } from '@tanstack/react-router'

import { JournalActivite } from '@/components/custom/journalActivite.tsx'
import { can } from '@/hooks/useCan.ts'
import { useServicesQuery } from '@/queries/useServices.ts'
import { resolveEstablishmentContext } from '@/utils/tenant-context.ts'

// Navigation par echelle (2026-09-28) : le journal d'activite est une prerogative de
// l'administrateur d'etablissement (`activity-log:read`) et couvre tout l'etablissement
// (`ActivityLogRepository.scopeFilter`, cote back), filtrable par service. Il vivait sous un
// service, ou il ne montrait que ce service et restait hors d'atteinte d'un administrateur sans
// affectation de service.
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/admin/activity-log',
)({
  // Meme garde explicite que `members.tsx`.
  beforeLoad: ({ context, params }) => {
    const tenant = resolveEstablishmentContext(context.authState.user, params)
    if (!can(tenant, 'activity-log:read')) {
      throw redirect({ to: '/' })
    }
  },
  component: ActivityLogPage,
})

function ActivityLogPage() {
  const { services } = useServicesQuery()
  return <JournalActivite services={services ?? []} />
}

export default ActivityLogPage
