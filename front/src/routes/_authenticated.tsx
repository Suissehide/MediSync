import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { meQueryOptions } from '@/queries/useMe.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    if (!context.authState.isAuthenticated) {
      throw redirect({ to: '/auth', search: { redirect: location.href } })
    }

    // Le store persiste survit aux rechargements : sans ce rappel, une
    // affectation accordee ou retiree n'apparaitrait qu'apres une
    // deconnexion. Les gardes de contexte validant contre cet arbre, il doit
    // etre frais avant qu'elles ne s'executent.
    try {
      const user = await context.queryClient.ensureQueryData(meQueryOptions)
      useAuthStore.getState().update(user)
    } catch {
      // Session expiree ou back injoignable : `fetchWithAuth` a deja tente le
      // rafraichissement. On laisse l'arbre persiste servir, plutot que de
      // bloquer l'application sur une panne reseau.
    }
  },
  component: () => <Outlet />,
})
