import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { can } from '@/hooks/useCan.ts'
import type { Permission } from '@/utils/permissions.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Permissions couvrant les ecrans d'organisation du service (Planning, Thematiques,
// Diagnostics, et depuis le 2026-09-29 Soignants et Salles, propres a chaque service). La
// branche admet quiconque detient au moins l'une d'elles ; chaque ecran se garde ensuite par la
// sienne. Aucune permission d'etablissement n'y figure : celles de l'administration vivent sous
// /e/:id/admin.
const SETTINGS_PERMISSIONS: Permission[] = [
  'planning:write',
  'referentials:write',
]

export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!SETTINGS_PERMISSIONS.some((permission) => can(tenant, permission))) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: () => <Outlet />,
})
