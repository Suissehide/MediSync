import Boom from '@hapi/boom'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'

import { buildErrorHandler } from '../../../main/interfaces/http/fastify/errors/error.handler'
import { boomErrorNormalizer } from '../../../main/interfaces/http/fastify/errors/normalizers/boom.error.normalizer'
import { fastifyErrorNormalizer } from '../../../main/interfaces/http/fastify/errors/normalizers/fastify.error.normalizer'
import { accessLinkRouter } from '../../../main/interfaces/http/fastify/routes/auth/access-link.router'
import {
  incomingRequestLog,
  requestCompletedLog,
} from '../../../main/interfaces/http/fastify/util/request-log'
import type { IocContainer } from '../../../main/types/application/ioc'

// Reprend le harnais d'`error-response-leak.test.ts` : les SIX niveaux de journal sont câblés,
// pas seulement `debug`/`error` — à l'étape 3, six tests ne surveillaient que le canal `error` et
// cinq sabotages passaient parce qu'ils fuyaient par `warn`, par `info` ou ailleurs.
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

// Distinctif : ne peut apparaître par hasard dans un nom de méthode, de route ou un message
// d'erreur générique.
const TOKEN = 'JETON-ACCES-9fQzR2xA7bK_TEST_ONLY'
const PASSWORD = 'MotDePasseSuffisammentLong123!!'

type FakePinoLike = {
  level: string
  fatal: (msg: unknown) => void
  error: (msg: unknown) => void
  warn: (msg: unknown) => void
  info: (msg: unknown) => void
  debug: (msg: unknown) => void
  trace: (msg: unknown) => void
  child: () => FakePinoLike
}

const buildCapturingLogger = () => {
  const callsByLevel: Record<LogLevel, string[]> = {
    trace: [],
    debug: [],
    info: [],
    warn: [],
    error: [],
    fatal: [],
  }
  const allCalls: string[] = []
  const record = (level: LogLevel) => (message: unknown) => {
    const text = String(message)
    callsByLevel[level].push(text)
    allCalls.push(text)
  }
  const build = (): FakePinoLike => ({
    level: 'trace',
    fatal: record('fatal'),
    error: record('error'),
    warn: record('warn'),
    info: record('info'),
    debug: record('debug'),
    trace: record('trace'),
    // Fastify crée un logger enfant par requête : le même enregistrement doit s'y propager.
    child: () => build(),
  })
  const loggerInstance = build()
  return { loggerInstance, callsByLevel, allCalls }
}

type ConsumeOutcome = 'success' | 'expired' | 'deactivated'

const throwFor = (outcome: ConsumeOutcome): void => {
  if (outcome === 'expired') {
    throw Boom.resourceGone('Invalid or expired access link')
  }
  throw Boom.unauthorized('Account deactivated')
}

// Construit un serveur Fastify minimal (sans base de données) qui enregistre le VRAI routeur
// `accessLinkRouter` (pas une réimplémentation) avec un `accessLinkDomain` bouchonné, la VRAIE
// chaîne de normalizers d'erreur, et les DEUX VRAIS formateurs de journal de requête
// (`incomingRequestLog`/`requestCompletedLog`, extraits de `fastify-http-server.ts` pour rester
// exerçables ici) câblés de la même façon que le serveur de production.
const buildApp = (
  outcome: ConsumeOutcome,
): {
  app: FastifyInstance
  allCalls: string[]
  registeredUrls: string[]
} => {
  const { loggerInstance, allCalls } = buildCapturingLogger()
  const registeredUrls: string[] = []

  const iocContainer = {
    logger: {
      debug: loggerInstance.debug,
      info: loggerInstance.info,
      warn: loggerInstance.warn,
      error: loggerInstance.error,
      trace: loggerInstance.trace,
    },
    accessLinkDomain: {
      consume: async (): Promise<void> => {
        if (outcome === 'success') {
          return
        }
        throwFor(outcome)
      },
      issue: async () => ({ token: 'unused' }),
    },
  } as unknown as IocContainer

  const app = Fastify({ loggerInstance, disableRequestLogging: true })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.withTypeProvider<ZodTypeProvider>()
  app.iocContainer = iocContainer
  app.setErrorHandler(
    buildErrorHandler(fastifyErrorNormalizer, boomErrorNormalizer),
  )

  // Les deux mêmes hooks que `fastify-http-server.ts`, avec les mêmes fonctions IMPORTÉES —
  // seule la construction du serveur (sans IoC complet, sans DB) diffère de la production.
  app.addHook('onRequest', (request) => {
    app.log.debug(incomingRequestLog(request.id, request.method, request.url))
    return Promise.resolve()
  })
  app.addHook('onResponse', (request, reply) => {
    app.log.info(
      requestCompletedLog(request.id, request.method, request.url, reply.statusCode, 0),
    )
    return Promise.resolve()
  })
  app.addHook('onRoute', (routeOptions) => {
    registeredUrls.push(routeOptions.url)
  })

  return { app, allCalls, registeredUrls }
}

describe("le lien d'acces (POST /auth/access-link/consume) ne fait jamais fuir le jeton dans un journal", () => {
  it.each<[ConsumeOutcome, number]>([
    ['success', 200],
    ['expired', 410],
    ['deactivated', 401],
  ])(
    'chemin %s (HTTP %i) : le jeton n apparait sur AUCUN canal du journal, sur la sortie brute',
    async (outcome, expectedStatus) => {
      const { app, allCalls } = buildApp(outcome)
      await app.register(accessLinkRouter, { prefix: '/auth/access-link' })
      await app.ready()

      const res = await app.inject({
        method: 'POST',
        url: '/auth/access-link/consume',
        payload: { token: TOKEN, password: PASSWORD },
      })

      expect(res.statusCode).toBe(expectedStatus)
      expect(allCalls.length).toBeGreaterThan(0)
      for (const line of allCalls) {
        expect(line).not.toContain(TOKEN)
        expect(line).not.toContain(PASSWORD)
      }

      await app.close()
    },
  )

  it('une charge invalide (jeton manquant) ne fuit pas non plus le mot de passe soumis', async () => {
    const { app, allCalls } = buildApp('success')
    await app.register(accessLinkRouter, { prefix: '/auth/access-link' })
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/auth/access-link/consume',
      payload: { password: PASSWORD },
    })

    expect(res.statusCode).toBe(400)
    for (const line of allCalls) {
      expect(line).not.toContain(PASSWORD)
    }

    await app.close()
  })

  // Garde STRUCTURELLE (pas un cas) : la route réellement enregistrée ne porte ni segment
  // dynamique, ni query — le jeton ne peut donc voyager que dans le corps. Rendue rouge sans son
  // mécanisme en modifiant temporairement `access-link.router.ts` pour lire le jeton depuis
  // `request.params`/`request.query` plutôt que `request.body` (voir task-4-report.md) : la
  // route enregistrée devient alors `/consume/:token`, et cette assertion échoue.
  it("la route consume ne déclare aucun paramètre d'URL ni de query : le jeton ne peut voyager que dans le corps", async () => {
    const { app, registeredUrls } = buildApp('success')
    await app.register(accessLinkRouter, { prefix: '/auth/access-link' })
    await app.ready()

    const consumeRoutes = registeredUrls.filter((url) =>
      url.startsWith('/auth/access-link/consume'),
    )
    expect(consumeRoutes).toEqual(['/auth/access-link/consume'])
    for (const url of consumeRoutes) {
      expect(url).not.toContain(':')
    }

    await app.close()
  })

  // Démontre, par exécution, POURQUOI la garde ci-dessus importe : si un jeton empruntait malgré
  // tout l'URL (une forme que ce dépôt n'enregistre jamais), les deux mêmes formateurs de journal
  // que la production le recopieraient tel quel — `pathWithoutQuery` (utils/url-helper.ts) ne
  // retire que la chaîne de requête (`?...`), jamais un segment de chemin (task-5-re-review-3.md,
  // I3, pour la fuite qu'il ferme déjà, différente de celle-ci). Les VRAIS formateurs sont
  // exercés directement, pas réimplémentés.
  it('un jeton place dans une URL (jamais celle de ce routeur) fuirait dans le journal des requetes : la raison d etre du corps-seul', () => {
    const urlWithToken = `/auth/access-link/consume/${TOKEN}`
    const incoming = incomingRequestLog(1, 'POST', urlWithToken)
    const completed = requestCompletedLog(1, 'POST', urlWithToken, 200, 3)

    expect(incoming).toContain(TOKEN)
    expect(completed).toContain(TOKEN)
  })
})
