import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { resolveEstablishmentContext } from '@/utils/tenant-context.ts'

// Contexte sans service : c'est ce qui permet a un administrateur sans
// affectation de service d'atteindre malgre tout l'administration. Ne jamais
// memoriser ce contexte comme « dernier visite » — il ne designe pas un
// service et ne peut donc pas servir de destination par defaut (voir
// `rememberContext`, qui n'est d'ailleurs pas appele ici).
export const Route = createFileRoute('/_authenticated/e/$establishmentId/admin')({
  beforeLoad: ({ context, params, preload }) => {
    const tenant = resolveEstablishmentContext(context.authState.user, params)
    if (!tenant) {
      // `/choose-context` n'existe pas encore (tache 12). `href` reference
      // la route en avance sans affirmer un typage faux — voir la meme
      // remarque dans `s/$serviceId.tsx`.
      throw redirect({ href: '/choose-context' })
    }
    // Meme raison qu'en s/$serviceId.tsx : le routeur precharge a
    // l'intention (`defaultPreload: 'intent'`), donc survoler un lien vers
    // cet ecran execute deja ce `beforeLoad`. Poser le contexte a ce
    // moment ferait fuiter un simple survol dans le store ; on reserve
    // `setContext` a une vraie navigation.
    if (preload) {
      return
    }
    useAuthStore.getState().setContext(tenant)
  },
  component: () => <Outlet />,
})
