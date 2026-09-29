import { createFileRoute, redirect } from '@tanstack/react-router'

import {
  administeredEstablishments,
  defaultTenantContext,
} from '@/utils/tenant-context.ts'

// Cette ancienne URL visait la gestion des membres, qui vit desormais sous
// l'administration d'etablissement : pas de service, donc un autre modele
// que les onze autres redirections (`redirectToDefaultService`).
export const Route = createFileRoute('/_authenticated/settings/user')({
  beforeLoad: ({ context }) => {
    const user = context.authState.user
    // L'ecran des membres est un ecran d'ADMINISTRATION D'ETABLISSEMENT : sa
    // destination se resout donc sur les etablissements ADMINISTRES, et sur
    // eux seuls. Consulter d'abord `defaultTenantContext`, qui rend n'importe
    // quel couple accessible — administre ou non —, envoyait un compte membre
    // d'un etablissement et administrateur d'un AUTRE vers l'administration
    // du premier : le layout la refusait faute du role ADMIN, et la personne
    // rebondissait vers le choix de contexte alors que son acces existait,
    // ailleurs.
    const administres = administeredEstablishments(user)
    // Parmi les etablissements administres, celui du dernier couple visite
    // s'il en fait partie : sans cela, un administrateur de plusieurs
    // etablissements serait toujours ramene au premier de son arbre, quel que
    // soit celui qu'il venait de quitter. `defaultTenantContext` n'est plus
    // qu'un critere de PREFERENCE, jamais la source de la destination.
    const dernierCouple = defaultTenantContext(user)
    const cible =
      administres.find(
        (etablissement) => etablissement.id === dernierCouple?.establishmentId,
      ) ?? administres[0]
    if (cible) {
      throw redirect({
        to: '/e/$establishmentId/admin/members',
        params: { establishmentId: cible.id },
        // Meme regle que `redirectToDefaultService` : conserver les
        // parametres de recherche entrants.
        search: true,
      })
    }
    // Aucun etablissement administre : l'ecran des membres n'existe pour ce
    // compte nulle part, et viser une URL d'administration au hasard ne
    // ferait que provoquer le rebond qu'on vient de fermer. On l'envoie donc
    // directement la ou le layout d'administration l'aurait envoye, un saut
    // plus tot — un ecran reel, avec des liens sortants.
    if (dernierCouple) {
      throw redirect({ to: '/choose-context' })
    }
    // Ni service ni administration : la seule absence totale d'acces. Meme
    // repli que `index.tsx`.
    throw redirect({ to: '/pending' })
  },
})
