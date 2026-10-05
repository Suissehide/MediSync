import { createFileRoute, redirect } from '@tanstack/react-router'

import {
  administeredEstablishments,
  defaultTenantContext,
} from '@/utils/tenant-context.ts'

export const Route = createFileRoute('/_authenticated/')({
  beforeLoad: ({ context }) => {
    const tenant = defaultTenantContext(context.authState.user)
    if (tenant && tenant.serviceId !== null) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params: {
          establishmentId: tenant.establishmentId,
          serviceId: tenant.serviceId,
        },
      })
    }
    // Aucun couple établissement/service : avant de conclure à une absence
    // d'accès, on regarde si la personne administre un établissement — cet
    // accès-là existe bel et bien, sous une URL sans service. Seule
    // l'absence des deux mène à l'écran d'attente.
    const [administered] = administeredEstablishments(context.authState.user)
    if (administered) {
      throw redirect({
        to: '/e/$establishmentId/admin',
        params: { establishmentId: administered.id },
      })
    }
    // L'etat que laisse le script d'amorcage (isSuperAdmin posE, AUCUN
    // rattachement — ce script ne cree jamais d'appartenance d'etablissement)
    // n'a ni couple service/etablissement ni etablissement administre : sans
    // ce cas, il tombait sur /pending, qui monte un ecran sans DashboardLayout
    // (donc sans barre laterale, donc sans l'entree « Super-administration »)
    // et qui lui ment (« en attente d'approbation », faux pour ce compte).
    // Doit rester APRES les deux verifications ci-dessus : un super-admin qui
    // a par ailleurs un acces a un etablissement atterrit d'abord sur
    // celui-ci, comme n'importe quel autre compte — «un acces», pas
    // necessairement «une vraie appartenance» : `administeredEstablishments`
    // (et `defaultTenantContext` plus haut) lisent `user.establishments`, qui
    // porte aussi bien un rattachement reel qu'un etablissement atteint par
    // un octroi temporaire VIVANT (`origine: 'octroi'`) — les deux
    // declenchent la meme redirection ici.
    if (context.authState.user?.isSuperAdmin === true) {
      throw redirect({ to: '/super-admin' })
    }
    throw redirect({ to: '/pending' })
  },
})
