import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { rememberContext, resolveTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute('/_authenticated/e/$establishmentId/s/$serviceId')({
  // `beforeLoad` et non un effet de rendu : c'est la seule position qui
  // garantisse qu'aucun chargeur enfant ne parte avec le contexte precedent.
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!tenant) {
      // `/choose-context` n'existe pas encore : c'est la tache 12 qui la
      // cree. Reference en avance, comme le layout d'etablissement de la
      // tache 8 ; l'echappatoire de typage disparaitra de lui-meme une fois
      // la route enregistree, sans qu'il soit necessaire d'y revenir.
      throw redirect({ to: '/choose-context' as never })
    }
    useAuthStore.getState().setContext(tenant)
    if (context.authState.user) {
      rememberContext(context.authState.user.id, tenant)
    }
  },
  component: () => <Outlet />,
})
