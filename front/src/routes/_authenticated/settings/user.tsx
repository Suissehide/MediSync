import { createFileRoute, redirect } from '@tanstack/react-router'

import { defaultTenantContext } from '@/utils/tenant-context.ts'

// Cette ancienne URL visait la gestion des membres, qui vit desormais sous
// l'administration d'etablissement : pas de service, donc un autre modele
// que les onze autres redirections (`redirectToDefaultService`).
export const Route = createFileRoute('/_authenticated/settings/user')({
  beforeLoad: ({ context }) => {
    const tenant = defaultTenantContext(context.authState.user)
    if (!tenant) {
      throw redirect({ to: '/pending' })
    }
    throw redirect({
      to: '/e/$establishmentId/admin/members',
      params: { establishmentId: tenant.establishmentId },
      // Meme regle que `redirectToDefaultService` : conserver les
      // parametres de recherche entrants.
      search: true,
    })
  },
})
