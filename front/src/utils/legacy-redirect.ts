import { redirect } from '@tanstack/react-router'

import type { User } from '@/types/auth.ts'
import { defaultTenantContext } from '@/utils/tenant-context.ts'

// Les anciennes URLs ne portent aucun service. On applique la regle du
// contexte par defaut, jamais une devinette.
export const redirectToDefaultService = (user: User | null, to: string, extra?: Record<string, string>): never => {
  const tenant = defaultTenantContext(user)
  if (!tenant || tenant.serviceId === null) {
    throw redirect({ to: '/pending' })
  }
  throw redirect({
    to,
    params: {
      establishmentId: tenant.establishmentId,
      serviceId: tenant.serviceId,
      ...extra,
    },
  })
}
