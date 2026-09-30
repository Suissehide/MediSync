import type { FastifyPluginAsync } from 'fastify'

import {
  type AccessLinkConsumeInput,
  accessLinkConsumeResponseSchema,
  accessLinkConsumeSchema,
} from '../../schemas/auth.schema'

// Le jeton est un identifiant de connexion : il ne doit apparaître dans AUCUNE URL — il passe
// donc uniquement dans le corps de ce POST, jamais dans un paramètre de route ni une query
// (spec §6.1 ; voir back/src/test/unit/interfaces/access-link-token-leak.test.ts, qui exige
// cette forme).
const accessLinkRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { accessLinkDomain } = iocContainer

  fastify.post<{ Body: AccessLinkConsumeInput }>(
    '/consume',
    {
      schema: {
        body: accessLinkConsumeSchema,
        response: {
          200: accessLinkConsumeResponseSchema,
        },
      },
      config: {
        // Anti brute-force : un jeton se devine par force brute comme un mot de passe.
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    // Pas de nouvelle validation manuelle ici (CODE MORT, retiré) : le `schema.body` ci-dessus
    // est déjà appliqué par Fastify — via
    // le `validatorCompiler` de `fastify-type-provider-zod`, enregistré globalement
    // (`fastify-http-server.ts`) — AVANT que ce gestionnaire ne s'exécute. Un corps qui ne
    // correspond pas à `accessLinkConsumeSchema` ne l'atteint donc jamais ; `request.body` est ici
    // TOUJOURS déjà `AccessLinkConsumeInput`. Une version antérieure de ce fichier reprenait, du
    // même endroit dans `register.router.ts`/`sign-in.router.ts` (qui portent la même
    // redondance), un second `accessLinkConsumeSchema.safeParse(request.body)` suivi d'un `throw
    // Boom.badRequest(...)` en cas d'échec — jamais atteignable. Prouvé par exécution : remplacer
    // temporairement cette branche par un `throw new Error('SONDE...')` et rejouer le test « une
    // charge invalide (jeton manquant) » (`access-link-token-leak.test.ts`) continuait de rendre
    // 400 sans jamais lever cette erreur — la preuve que la branche manuelle n'était jamais
    // exécutée, Fastify ayant déjà tranché avant elle.
    async (request) => {
      const { token, password } = request.body
      await accessLinkDomain.consume(token, password)
      return { success: true }
    },
  )
  return Promise.resolve()
}

export { accessLinkRouter }
