import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { rememberContext, resolveTenantContext } from '@/utils/tenant-context.ts'

export const Route = createFileRoute('/_authenticated/e/$establishmentId/s/$serviceId')({
  // `beforeLoad` et non un effet de rendu : c'est la seule position qui
  // garantisse qu'aucun chargeur enfant ne parte avec le contexte precedent.
  beforeLoad: ({ context, params, preload }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!tenant) {
      // `/choose-context` existe depuis la tache 12 (selecteur et page de
      // choix) : `to` verifie desormais la destination contre l'arbre de
      // routes genere, plutot que de s'en remettre a une chaine libre.
      throw redirect({ to: '/choose-context' })
    }
    // Le routeur precharge a l'intention (`defaultPreload: 'intent'` dans
    // main.tsx) : survoler un lien execute deja `beforeLoad`, avant toute
    // navigation reelle. Poser le contexte ici ferait fuiter un simple
    // survol dans le store et dans `localStorage`, et la prochaine requete
    // de l'ecran affiche partirait vers le tenant survole, pas vers le sien
    // — exactement la fuite inter-service que ce layout existe pour
    // empecher. La resolution et la redirection ci-dessus restent
    // inconditionnelles ; seuls les effets de bord (`setContext`,
    // `rememberContext`) sont reserves a une vraie navigation. Un lecteur
    // qui ignore le prechargement sera tente de retirer cette condition :
    // ne le faites pas, voir le test qui la verrouille.
    if (preload) {
      return
    }
    useAuthStore.getState().setContext(tenant)
    if (context.authState.user) {
      rememberContext(context.authState.user.id, tenant)
    }
  },
  component: () => <Outlet />,
})
