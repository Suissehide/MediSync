import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { can } from '@/hooks/useCan.ts'
import type { Permission } from '@/utils/permissions.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Permissions couvrant les ecrans de reglages de service. La branche admet
// quiconque detient au moins l'une d'elles ; chaque ecran se garde ensuite par
// la sienne. `members:manage` n'y figure plus : l'ecran Membres administre des
// appartenances d'etablissement et vit desormais sous /e/:id/admin.
const SETTINGS_PERMISSIONS: Permission[] = [
  'planning:write',
  'soignants:manage',
  'referentials:write',
  'locations:manage',
  'activity-log:read',
]

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
