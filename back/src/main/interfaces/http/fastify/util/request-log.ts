import { pathWithoutQuery } from '../../../../utils/url-helper'

// Extrait de `fastify-http-server.ts` pour rester exerçable directement par un test (voir
// `back/src/test/unit/interfaces/access-link-token-leak.test.ts`), sans reconstruire un serveur
// Fastify complet. Comportement inchangé : ce sont les deux mêmes lignes qu'avant l'extraction.
//
// `pathWithoutQuery` (utils/url-helper.ts) ne retire que la CHAINE DE REQUÊTE (`?...`), jamais un
// segment de chemin, pour la fuite qu'il ferme déjà. Un jeton passé
// en paramètre d'URL (`/consume/:token`) resterait donc entier dans ces deux lignes — c'est
// précisément ce que le test de fuite du jeton démontre par exécution, et
// pourquoi le lien d'accès ne voyage QUE dans le corps d'un POST (spec §6.1).
export const incomingRequestLog = (
  requestId: string | number,
  method: string,
  url: string,
): string =>
  `Incoming request (#${requestId}): ${method} ${pathWithoutQuery(url)}`

export const requestCompletedLog = (
  requestId: string | number,
  method: string,
  url: string,
  statusCode: number,
  elapsedMs: number,
): string =>
  `Request completed (#${requestId}): ${method} ${pathWithoutQuery(url)} [HTTP ${statusCode}] (${elapsedMs}ms)`
