export const toLocalhostIfLinux = (address: string): string =>
  process.platform === 'linux'
    ? address.replace('127.0.0.1', 'localhost').replace('0.0.0.0', 'localhost')
    : address

// Prefixes de route dont AUCUN segment supplementaire n'est legitime (etape 4a, tache 4, tour de
// correction 1, Important n°1). `pathWithoutQuery` ne retirait que la chaine de requete, jamais
// un segment de CHEMIN : une requete vers `/auth/access-link/consume/<jeton>` — qui ne correspond
// a aucune route declaree, puisque le lien d'acces ne voyage que dans le corps d'un POST — tombe
// sur le gestionnaire de route inconnue (`not-found.handler.ts`), qui recopiait ce chemin en
// entier dans le message du Boom 404 : corps HTTP compris, plus les quatre lignes de journal qui
// partagent toutes `pathWithoutQuery` (les deux crochets generiques de `fastify-http-server.ts`,
// qui s'executent AVANT toute resolution de route, et les deux lignes d'`error.handler.ts`).
// Fermer ce SEUL point de passage referme les quatre a la fois.
//
// Pas de detection generique d'un « secret » dans une URL : cette liste est fermee et nommee,
// pas devinee. Un futur prefixe sensible s'y ajoute explicitement (voir
// `access-link-token-leak.test.ts`, qui exige cette troncature en construisant l'URL fautive
// ci-dessus et en verifiant qu'elle n'atteint ni le corps de la reponse 404, ni aucun canal de
// journal, ni un en-tete de reponse).
const NO_SUFFIX_PATH_PREFIXES: readonly string[] = ['/auth/access-link/consume']

const truncateAtSensitivePrefix = (path: string): string => {
  const prefix = NO_SUFFIX_PATH_PREFIXES.find(
    (candidate) => path === candidate || path.startsWith(`${candidate}/`),
  )
  return prefix ?? path
}

// Retire la chaine de requete d'une URL avant de la journaliser (task-5-re-review-3.md, I3) :
// `GET /patient/export?search=<nom du patient>` recopiait un nom de patient dans le journal
// applicatif, au niveau `info`, sur le chemin heureux, sans qu'aucune erreur ne survienne. Aucun
// autre parametre de requete de l'API ne porte aujourd'hui de donnee personnelle (page, action,
// userID, from/to/year/month, pathwayTemplateTags — des noms techniques ou des identifiants, pas
// du texte libre) ; on retire toute la chaine plutot que de maintenir une liste de parametres a
// masquer au coup par coup, qui se perime des qu'une route ajoute un filtre en texte libre sans y
// penser. Le chemin lui-meme est ensuite tronque a `NO_SUFFIX_PATH_PREFIXES`, s'il y correspond.
export const pathWithoutQuery = (url: string): string =>
  truncateAtSensitivePrefix(url.split('?')[0] ?? url)
