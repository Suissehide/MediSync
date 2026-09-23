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
      // Le routeur fusionne le contexte enfant depuis la VALEUR DE RETOUR de
      // ce `beforeLoad`, pas depuis le store : l'ecriture ci-dessus n'atteint
      // `router.options.context` qu'au prochain rendu React, dans
      // `main.tsx`. Sans ce retour, les gardes de `_admin` et de `planning`
      // valideraient sur cette meme navigation contre l'arbre d'avant le
      // rappel. Les deux ecritures restent necessaires : celle-ci sert les
      // gardes/chargeurs du routeur, le store sert les fabriques d'URL et
      // les composants, qui ne lisent pas le contexte du routeur.
      return { authState: { isAuthenticated: true, user } }
    } catch {
      // Session expiree ou back injoignable : `fetchWithAuth` a deja tente le
      // rafraichissement. On laisse l'arbre persiste servir, plutot que de
      // bloquer l'application sur une panne reseau — et on renvoie le meme
      // `authState` recu en entree, pour que les gardes enfants ne se
      // retrouvent jamais avec un contexte indefini.
      return { authState: context.authState }
    }
  },
  component: () => <Outlet />,
})
