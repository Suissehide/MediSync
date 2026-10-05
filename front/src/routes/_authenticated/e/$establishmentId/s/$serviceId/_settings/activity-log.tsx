import { createFileRoute, redirect } from '@tanstack/react-router'

import { JournalActivite } from '@/components/custom/journalActivite.tsx'
import { can } from '@/hooks/useCan.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Journal d'activite du chef de service : son seul service, borne par le back.
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/_settings/activity-log',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'service-journal:read')) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: () => <JournalActivite />,
})
