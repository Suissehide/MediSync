import { escapeLikePattern } from './like-pattern'

// REVUE FINALE DE BRANCHE (etape 4b), Important n°1 — LE FILTRE « COMPTE » DE LA LECTURE
// PLATEFORME, evalue EN BASE.
//
// Ce qu'il remplace : l'ecran plateforme filtrait le compte DANS LE NAVIGATEUR, sur la page deja
// tronquee a `PLATFORM_ACCESS_LOG_LIMIT` (200 lignes, `createdAt desc`). Chercher un compte
// rendait « aucune entree » des que ses lignes etaient plus anciennes que la 200e -- alors
// qu'elles existaient. Le filtre serveur, lui, existait, etait eprouve, et n'etait appele par
// personne : il n'acceptait qu'un `userID` EXACT, que personne ne tape de memoire.
//
// Ce filtre-ci accepte les DEUX formes que l'ecran peut produire, d'ou le `OR` :
//   - l'identifiant exact (ce que faisait l'ancien filtre : rien n'est perdu au change) ;
//   - un fragment de prenom OU de nom, insensible a la casse.
//
// LES NOMS SONT LES COPIES DENORMALISEES portees par chaque ligne de journal
// (`userFirstName`/`userLastName`, memes colonnes dans les deux modeles), jamais une jointure
// vers `User` : un journal d'audit doit dire qui a agi SOUS LE NOM QU'IL PORTAIT ALORS, et une
// jointure depuis `PatientAccessLog` (modele de service) vers `User` (modele global) est de
// toute facon exactement le pont que le garde-fou refuse ailleurs.
//
// `escapeLikePattern` (utils/like-pattern.ts) : sans lui, chercher « % » rendrait TOUTES les
// lignes de la plateforme au lieu d'aucune -- meme raison, et meme fonction, que la recherche
// d'identite de patient (patient.repository.ts).
//
// LA FORME DU RETOUR est volontairement structurelle (aucun type Prisma importe) : les deux
// depots portent des modeles differents, mais ces trois colonnes existent a l'identique dans les
// deux, donc le meme objet convient aux deux `where` sans qu'aucun des deux ne depende de
// l'autre -- meme raison que la duplication assumee de `PlatformAccessLogFilters`.
export const platformCompteFilter = (
  compte: string | undefined,
): {
  OR?: (
    | { userID: string }
    | { userFirstName: { contains: string; mode: 'insensitive' } }
    | { userLastName: { contains: string; mode: 'insensitive' } }
  )[]
} => {
  if (!compte) {
    return {}
  }
  const fragment = escapeLikePattern(compte)
  return {
    OR: [
      { userID: compte },
      { userFirstName: { contains: fragment, mode: 'insensitive' } },
      { userLastName: { contains: fragment, mode: 'insensitive' } },
    ],
  }
}
