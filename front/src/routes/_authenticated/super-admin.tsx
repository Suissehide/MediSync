import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'

// Écrans du super-admin (tâche 12, étape 4a) : hors de tout tenant. Ce
// layout ne pose donc AUCUN contexte (`setContext`) et ne déclare aucune
// `remountDeps` — `src/test/layouts-de-tenant.test.ts` exige que les deux
// ensembles (fichiers appelant `setContext`, fichiers déclarant
// `remountDeps`) coïncident exactement ; en être absent des deux est la
// seule position correcte pour un layout qui n'a pas de tenant à faire
// survivre à un changement de contexte. Rien ici n'appelle une API de
// tenant, donc rien n'a besoin d'être démonté au changement
// d'établissement/service.
//
// La garde ci-dessous reproduit côté front le parti pris du back
// (`requireSuperAdmin`, super-admin.routes.ts) : un compte sans le drapeau
// `isSuperAdmin` reçoit `notFound()`, EXACTEMENT comme n'importe quelle
// destination inconnue — jamais un écran « réservé aux
// super-administrateurs », qui annoncerait à qui n'y a pas droit que cette
// zone existe (spec §5.2/§6.2 ; back rend 404, jamais 403, pour la même
// raison).
//
// Tour de correction 1, Important n°1 : une REDIRECTION vers '/' a d'abord
// été utilisée ici, et c'était un défaut — elle est discernable d'une URL
// réellement inconnue en deux essais (aucun `notFoundComponent` n'est
// déclaré dans ce dépôt, voir `__root.tsx` : une URL inconnue rend donc le
// "Not Found" par défaut de TanStack Router, jamais une redirection). Deux
// réponses différentes pour « zone inexistante » et « zone existante mais
// interdite » EST l'oracle d'existence que le 404 (jamais 403) du back
// existe pour fermer. `notFound()` rend les deux chemins indiscernables :
// même défaut, même absence de redirection observable. Cette garde n'est
// qu'une commodité d'UX qui évite un aller-retour réseau voué à échouer ;
// la barrière réelle reste le back, qui ne fait pas confiance à ce que le
// front décide d'afficher.
export const Route = createFileRoute('/_authenticated/super-admin')({
  beforeLoad: ({ context }) => {
    if (context.authState.user?.isSuperAdmin !== true) {
      throw notFound()
    }
  },
  component: () => <Outlet />,
})
