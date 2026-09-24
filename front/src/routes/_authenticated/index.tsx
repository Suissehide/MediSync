import { createFileRoute, redirect } from '@tanstack/react-router'

import { administeredEstablishments, defaultTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute('/_authenticated/')({
  beforeLoad: ({ context }) => {
    const tenant = defaultTenantContext(context.authState.user)
    if (tenant && tenant.serviceId !== null) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params: { establishmentId: tenant.establishmentId, serviceId: tenant.serviceId },
      })
    }
    // Aucun couple établissement/service : avant de conclure à une absence
    // d'accès, on regarde si la personne administre un établissement — cet
    // accès-là existe bel et bien, sous une URL sans service (tâche 8). Seule
    // l'absence des deux mène à l'écran d'attente.
    const [administered] = administeredEstablishments(context.authState.user)
    if (administered) {
      throw redirect({
        to: '/e/$establishmentId/admin/members',
        params: { establishmentId: administered.id },
      })
    }
    throw redirect({ to: '/pending' })
  },
})
