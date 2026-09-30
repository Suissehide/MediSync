// Echappe les caracteres speciaux du motif `LIKE`/`ILIKE` (`%`, `_`) dans une valeur destinee a
// `contains` : sans cela, une valeur cherchee
// contenant l'un de ces deux caracteres — ou meme la seule valeur `%` — est traitee comme un
// joker par Postgres, et rend bien plus que ce que l'appelant a demande. L'antislash est echappe
// EN PREMIER : c'est le caractere d'echappement par defaut de LIKE/ILIKE sur Postgres, donc un
// antislash saisi par l'utilisateur doit lui-meme devenir litteral avant que `%`/`_` ne soient
// prefixes du meme caractere.
//
// EXTRAIT ICI : cette fonction vivait en tete de
// `patient.repository.ts`, ou elle garde la recherche d'identite de patient. Le filtre « compte »
// de la lecture plateforme (les deux depots de journaux) en a exactement le meme besoin, et une
// troisieme copie d'un echappement de ce genre est precisement la forme de duplication qui finit
// par diverger sur un seul des trois sites.
export const escapeLikePattern = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
