import { createFileRoute, redirect } from '@tanstack/react-router'

import { defaultTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute('/_authenticated/')({
  beforeLoad: ({ context }) => {
    const tenant = defaultTenantContext(context.authState.user)
    if (!tenant || tenant.serviceId === null) {
      throw redirect({ to: '/pending' })
    }
    throw redirect({
      to: '/e/$establishmentId/s/$serviceId/dashboard',
      params: { establishmentId: tenant.establishmentId, serviceId: tenant.serviceId },
    })
  },
})
