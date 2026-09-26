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
import { notFoundHandler } from '../../../main/interfaces/http/fastify/util/not-found.handler'
import {
  incomingRequestLog,
  requestCompletedLog,
} from '../../../main/interfaces/http/fastify/util/request-log'
import type { IocContainer } from '../../../main/types/application/ioc'

// Reprend le harnais d'`error-response-leak.test.ts` : les SIX niveaux de journal sont câblés,
// pas seulement `debug`/`error` — à l'étape 3, six tests ne surveillaient que le canal `error` et
// cinq sabotages passaient parce qu'ils fuyaient par `warn`, par `info` ou ailleurs.
//
// Tour de correction 1 (relecture externe) : sur les six sabotages qu'elle a essayés contre la
// version précédente de ce fichier, TROIS passaient — parce que ce fichier ne regardait que le
// journal applicatif. Élargi ici à ce qui sort réellement vers le client (en-têtes de réponse,
// corps de réponse) et vers le terminal en dehors du logger (`process.stdout`/`process.stderr`,
// qu'un `console.log` malencontreux emprunte aussi).
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

// Capture tout ce qu'écrit DIRECTEMENT le processus pendant `fn()` — `console.log`/`console.error`
// entre autres, qui empruntent `process.stdout`/`process.stderr` — sans passer par le logger
// (tour de correction 1, Important n°4 : un des trois sabotages qui passaient était une écriture
// directe sur la sortie standard). Toujours restauré, y compris si `fn()` lève ou si une
// assertion échoue ensuite.
const withCapturedStdWrites = async (
  fn: () => Promise<void>,
): Promise<string[]> => {
  const chunks: string[] = []
  const originalStdoutWrite = process.stdout.write.bind(process.stdout)
  const originalStderrWrite = process.stderr.write.bind(process.stderr)
  const record = (chunk: unknown, ...rest: unknown[]): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk))
    const callback = rest.find((arg) => typeof arg === 'function') as
      | (() => void)
      | undefined
    callback?.()
    return true
  }
  process.stdout.write = record as typeof process.stdout.write
  process.stderr.write = record as typeof process.stderr.write
  try {
    await fn()
  } finally {
    process.stdout.write = originalStdoutWrite
    process.stderr.write = originalStderrWrite
  }
  return chunks
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
// chaîne de normalizers d'erreur, le VRAI gestionnaire de route inconnue
// (`notFoundHandler`, `util/not-found.handler.ts`) et les DEUX VRAIS formateurs de journal de
// requête (`incomingRequestLog`/`requestCompletedLog`, extraits de `fastify-http-server.ts` pour
// rester exerçables ici) câblés de la même façon que le serveur de production.
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
  app.setNotFoundHandler(notFoundHandler)
  app.setErrorHandler(
    buildErrorHandler(fastifyErrorNormalizer, boomErrorNormalizer),
  )

  // Les mêmes hooks que `fastify-http-server.ts`, avec les mêmes fonctions IMPORTÉES — seule la
  // construction du serveur (sans IoC complet, sans DB) diffère de la production. Ils
  // s'exécutent AVANT toute résolution de route : c'est pour cela qu'une URL qui ne correspond à
  // AUCUNE route déclarée (le cas du segment d'URL sabotage, plus bas) les traverse quand même.
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

// Assertion complète : sur la sortie brute du JOURNAL (tous canaux), sur les EN-TÊTES de la
// réponse, et sur le CORPS de la réponse. Les trois ensemble sont « ce qui sort réellement vers
// le client et vers le terminal » (tour de correction 1, Important n°4), pas seulement le journal
// applicatif que la version précédente de ce fichier surveillait seule.
const expectNoLeak = (
  secret: string,
  allCalls: string[],
  res: { headers: Record<string, unknown>; payload: string },
  stdWrites: string[],
): void => {
  for (const line of allCalls) {
    expect(line).not.toContain(secret)
  }
  expect(JSON.stringify(res.headers)).not.toContain(secret)
  expect(res.payload).not.toContain(secret)
  for (const chunk of stdWrites) {
    expect(chunk).not.toContain(secret)
  }
}

describe("le lien d'acces (POST /auth/access-link/consume) ne fait jamais fuir le jeton", () => {
  it.each<[ConsumeOutcome, number]>([
    ['success', 200],
    ['expired', 410],
    ['deactivated', 401],
  ])(
    'chemin %s (HTTP %i) : le jeton et le mot de passe n apparaissent ni dans un journal, ni dans un en-tete, ni dans le corps, ni sur la sortie standard',
    async (outcome, expectedStatus) => {
      const { app, allCalls } = buildApp(outcome)
      await app.register(accessLinkRouter, { prefix: '/auth/access-link' })
      await app.ready()

      let res: Awaited<ReturnType<typeof app.inject>> | undefined
      const stdWrites = await withCapturedStdWrites(async () => {
        res = await app.inject({
          method: 'POST',
          url: '/auth/access-link/consume',
          payload: { token: TOKEN, password: PASSWORD },
        })
      })
      if (!res) {
        throw new Error('no response captured')
      }

      expect(res.statusCode).toBe(expectedStatus)
      expect(allCalls.length).toBeGreaterThan(0)
      expectNoLeak(TOKEN, allCalls, res, stdWrites)
      expectNoLeak(PASSWORD, allCalls, res, stdWrites)

      await app.close()
    },
  )

  it('une charge invalide (jeton manquant) ne fuit pas non plus le mot de passe soumis', async () => {
    const { app, allCalls } = buildApp('success')
    await app.register(accessLinkRouter, { prefix: '/auth/access-link' })
    await app.ready()

    let res: Awaited<ReturnType<typeof app.inject>> | undefined
    const stdWrites = await withCapturedStdWrites(async () => {
      res = await app.inject({
        method: 'POST',
        url: '/auth/access-link/consume',
        payload: { password: PASSWORD },
      })
    })
    if (!res) {
      throw new Error('no response captured')
    }

    expect(res.statusCode).toBe(400)
    expectNoLeak(PASSWORD, allCalls, res, stdWrites)

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

  // Tour de correction 1, Critique nommé « Important n°1 » : un jeton en SEGMENT D'URL, contre
  // une URL qui ne correspond à AUCUNE route déclarée, atteignait quand même le client et le
  // journal — par le gestionnaire de route inconnue (`notFoundHandler`), qui recopiait le chemin
  // en entier dans le message du Boom 404, ET par les deux crochets génériques ci-dessus, qui
  // s'exécutent avant toute résolution de route. Fermé en tronquant `pathWithoutQuery`
  // (utils/url-helper.ts) à ce préfixe précis. Exercé ici avec le VRAI gestionnaire de route
  // inconnue et la VRAIE chaîne d'erreurs, pas une réimplémentation.
  it("un jeton glissé en segment d'URL sous /auth/access-link/consume (route inconnue, jamais celle enregistrée) ne fuit ni dans le corps du 404, ni dans aucun journal, ni dans un en-tête", async () => {
    const { app, allCalls } = buildApp('success')
    await app.register(accessLinkRouter, { prefix: '/auth/access-link' })
    await app.ready()

    let res: Awaited<ReturnType<typeof app.inject>> | undefined
    const stdWrites = await withCapturedStdWrites(async () => {
      res = await app.inject({
        method: 'POST',
        url: `/auth/access-link/consume/${TOKEN}`,
      })
    })
    if (!res) {
      throw new Error('no response captured')
    }

    expect(res.statusCode).toBe(404)
    expectNoLeak(TOKEN, allCalls, res, stdWrites)

    await app.close()
  })

  // Documente la LIMITE du remède ci-dessus, pour qu'elle ne se lise pas comme une garantie
  // générale qu'elle n'est pas : `NO_SUFFIX_PATH_PREFIXES` (utils/url-helper.ts) est une liste
  // FERMÉE et NOMMÉE, pas une détection générique d'un secret dans une URL. Un jeton glissé sous
  // un préfixe qui n'y figure pas fuit toujours de la même façon — ce dépôt n'en enregistre
  // simplement aucun (voir la garde structurelle ci-dessus). Exercé directement sur les VRAIS
  // formateurs, pas réimplémenté.
  it('un jeton place sous un prefixe HORS LISTE fuirait toujours (limite assumee de la troncature nommee)', () => {
    const urlWithToken = `/une/route/qui/n/existe/pas/${TOKEN}`
    expect(incomingRequestLog(1, 'POST', urlWithToken)).toContain(TOKEN)
    expect(requestCompletedLog(1, 'POST', urlWithToken, 200, 3)).toContain(TOKEN)
  })
})
