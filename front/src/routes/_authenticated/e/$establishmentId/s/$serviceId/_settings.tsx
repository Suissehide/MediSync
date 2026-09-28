import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { can } from '@/hooks/useCan.ts'
import type { Permission } from '@/utils/permissions.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Permissions couvrant les ecrans d'organisation du service (Planning,
// Thematiques, Diagnostics). La branche admet quiconque detient au moins l'une
// d'elles ; chaque ecran se garde ensuite par la sienne. Aucune permission
// d'etablissement n'y figure plus : Membres, puis Soignants, Salles et le
// journal d'activite (navigation par echelle, 2026-09-28) vivent sous
// /e/:id/admin. Leurs anciennes adresses de service sont des redirections
// placees HORS de cette branche (`s/$serviceId/{soignant,location,activity-log}.tsx`,
// meme URL) : sous elle, cette garde renverrait au tableau de bord un
// administrateur sans permission d'organisation avant qu'elles ne s'executent.
const SETTINGS_PERMISSIONS: Permission[] = ['planning:write', 'referentials:write']

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!SETTINGS_PERMISSIONS.some((permission) => can(tenant, permission))) {
      throw redirect({ to: '/e/$establishmentId/s/$serviceId/dashboard', params })
    }
  },
  component: () => <Outlet />,
})
