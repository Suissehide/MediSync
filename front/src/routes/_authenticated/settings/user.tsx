import { createFileRoute, redirect } from '@tanstack/react-router'

import { administeredEstablishments, defaultTenantContext } from '@/utils/tenant-context.ts'

// Cette ancienne URL visait la gestion des membres, qui vit desormais sous
// l'administration d'etablissement : pas de service, donc un autre modele
// que les onze autres redirections (`redirectToDefaultService`).
export const Route = createFileRoute('/_authenticated/settings/user')({
  beforeLoad: ({ context }) => {
    const tenant = defaultTenantContext(context.authState.user)
    if (!tenant) {
      // Meme repli que `index.tsx` : `defaultTenantContext` ne rend qu'un
      // couple AVEC service, donc un administrateur sans affectation de
      // service n'en obtient aucun — et c'est justement lui qui a le plus de
      // chances d'avoir garde ce favori, puisque `/settings/user` etait
      // l'ecran Membres avant l'etape 2. Sans ce repli il atterrissait sur
      // l'ecran d'attente, qui n'a aucun lien sortant hormis la
      // deconnexion : l'impasse que la tache 15 venait de fermer ailleurs.
      // Son acces existe pourtant bel et bien, sous une URL sans service.
      const [administered] = administeredEstablishments(context.authState.user)
      if (administered) {
        throw redirect({
          to: '/e/$establishmentId/admin/members',
          params: { establishmentId: administered.id },
          search: true,
        })
      }
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
