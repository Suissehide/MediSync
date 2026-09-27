import Fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'

import { AccessLinkDomain } from '../../../main/domain/accessLink.domain'
import { UserDomain } from '../../../main/domain/user.domain'
import { buildErrorHandler } from '../../../main/interfaces/http/fastify/errors/error.handler'
import { boomErrorNormalizer } from '../../../main/interfaces/http/fastify/errors/normalizers/boom.error.normalizer'
import { fastifyErrorNormalizer } from '../../../main/interfaces/http/fastify/errors/normalizers/fastify.error.normalizer'
import { accessLinkRouter } from '../../../main/interfaces/http/fastify/routes/auth/access-link.router'
import { usersRouter } from '../../../main/interfaces/http/fastify/routes/super-admin/users'
import { notFoundHandler } from '../../../main/interfaces/http/fastify/util/not-found.handler'
import {
  incomingRequestLog,
  requestCompletedLog,
} from '../../../main/interfaces/http/fastify/util/request-log'
import { AccessLinkRepository } from '../../../main/infra/orm/repositories/accessLink.repository'
import type { IocContainer } from '../../../main/types/application/ioc'
import { AppEventBus } from '../../../main/utils/app-event-bus'
import { ErrorHandler } from '../../../main/utils/error-handler'
import { sha256Hex } from '../../../main/utils/hash'

// Reprend le harnais d'`error-response-leak.test.ts` : les SIX niveaux de journal sont câblés,
// pas seulement `debug`/`error` — à l'étape 3, six tests ne surveillaient que le canal `error` et
// cinq sabotages passaient parce qu'ils fuyaient par `warn`, par `info` ou ailleurs.
//
// Tour de correction 1 (relecture externe) : sur les six sabotages qu'elle a essayés contre la
// version précédente de ce fichier, TROIS passaient — parce que ce fichier ne regardait que le
// journal applicatif. Élargi à ce qui sort réellement vers le client (en-têtes de réponse, corps
// de réponse) et vers le terminal en dehors du logger (`process.stdout`/`process.stderr`, qu'un
// `console.log` malencontreux emprunte aussi).
//
// Tour de correction 2, Important : SEPT sabotages sur sept passaient encore, tous de la forme
// objet que pino recommande et qu'emploie le journal de requête réel —
// `log.error({ jeton }, 'message')`. La capture ne gardait que le PREMIER argument, converti par
// `String(...)` : `String({ token: 'SECRET' })` rend `"[object Object]"`, qui ne contient jamais
// la valeur des propriétés. Corrigé : `record` capture désormais TOUS les arguments de l'appel,
// sérialisés (JSON pour un objet, tel quel pour une chaîne). Et le harnais bouchonnait le domaine
// et le dépôt (tout ce qu'ils auraient pu écrire était donc invisible) : les trois scénarios
// principaux ci-dessous exercent maintenant le VRAI `AccessLinkDomain` et le VRAI
// `AccessLinkRepository` — un faux Prisma en mémoire remplace la base, mais aucune des deux
// classes n'est réimplémentée ni bouchonnée.
//
// Tour de correction 3 — CE QUE CE GARDE-FOU NE TIENT PAS, dit précisément plutôt que résumé en
// « tout est surveillé » (la relecture externe a montré, par sabotage, que cette phrase promettait
// plus que le mécanisme ne tient) : trois formes que le VRAI pino imprime sans lever échappent
// encore à `serializeLogArg` (plus bas) —
//   1. `log.error(err)`, un objet `Error` passé tel quel : `JSON.stringify(err)` rend `"{}"`
//      (les propriétés `message`/`stack` d'une `Error` ne sont pas énumérables), donc son
//      contenu — y compris un jeton qu'il porterait — disparaît silencieusement plutôt que de
//      faire échouer la capture ;
//   2. `log.error({ err }, 'message')`, la même `Error` nichée sous une clé : même cause, même
//      disparition silencieuse ;
//   3. les LIAISONS d'un logger enfant (`logger.child({ token })`, qui réapparaissent sur
//      CHAQUE ligne suivante émise par cet enfant chez le vrai pino) : le faux `child()`
//      ci-dessous ignore l'argument qu'on lui passe et ne le reporte jamais dans les lignes
//      capturées.
// Aucune fuite réelle aujourd'hui : le seul appelant de ce chemin (`error.handler.ts`,
// `diagnosticOf`/`routeOf`) ne journalise que des CHAÎNES qu'il construit lui-même, jamais une
// `Error` brute ni des liaisons de logger enfant — voir ces deux fonctions, qui n'appellent
// jamais `log.child(...)` et ne passent jamais un objet `Error` en premier argument. Mais ce
// garde-fou-ci ne le PROUVE pas pour un futur appelant qui le ferait ; il ne couvre que les
// formes qu'il capture réellement (chaîne, objet simple JSON-sérialisable).
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

// Distinctif : ne peut apparaître par hasard dans un nom de méthode, de route ou un message
// d'erreur générique.
const TOKEN = 'JETON-ACCES-9fQzR2xA7bK_TEST_ONLY'
const PASSWORD = 'MotDePasseSuffisammentLong123!!'

type FakePinoLike = {
  level: string
  fatal: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
  trace: (...args: unknown[]) => void
  child: () => FakePinoLike
}

// Sérialise CHAQUE argument d'un appel de journal, pas seulement le premier converti par
// `String(...)` — une chaîne reste telle quelle, un objet (la forme que pino recommande,
// `log.error({ jeton }, 'message')`) passe par `JSON.stringify` pour que ses propriétés
// apparaissent en clair dans le texte surveillé.
const serializeLogArg = (arg: unknown): string => {
  if (typeof arg === 'string') {
    return arg
  }
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
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
  const record = (level: LogLevel) => (...args: unknown[]) => {
    const text = args.map(serializeLogArg).join(' ')
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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

type FakeLinkRow = {
  tokenHash: string
  userId: string
  usedAt: Date | null
  expiresAt: Date
}
type FakeUserRow = { id: string; deactivatedAt: Date | null }

// Un Prisma en mémoire, juste assez large pour que le VRAI `AccessLinkRepository` fonctionne
// contre lui : ni une base réelle (ce fichier reste un test unitaire, sans DB), ni une
// réimplémentation du dépôt — seul son intermédiaire (le client Prisma) est remplacé.
const buildFakePrisma = (link: FakeLinkRow, user: FakeUserRow) => ({
  accessLink: {
    findUnique: ({ where }: { where: { tokenHash: string } }) =>
      Promise.resolve(
        where.tokenHash === link.tokenHash
          ? { ...link, user: { id: user.id, deactivatedAt: user.deactivatedAt } }
          : null,
      ),
    updateMany: ({
      where,
      data,
    }: {
      where: { tokenHash: string; usedAt: null; expiresAt: { gt: Date } }
      data: { usedAt: Date }
    }) => {
      if (
        where.tokenHash !== link.tokenHash ||
        link.usedAt !== null ||
        link.expiresAt.getTime() <= where.expiresAt.gt.getTime()
      ) {
        return Promise.resolve({ count: 0 })
      }
      link.usedAt = data.usedAt
      return Promise.resolve({ count: 1 })
    },
  },
})

// Construit le VRAI `AccessLinkDomain`, câblé sur le VRAI `AccessLinkRepository` (lui-même câblé
// sur le faux Prisma ci-dessus et sur un VRAI `ErrorHandler`, qui partage le même logger capturé
// que le reste du test) — la donnée en mémoire est choisie pour que le domaine, par sa propre
// logique, produise l'issue demandée (succès, expiration, compte désactivé), plutôt que de
// bouchonner `consume` pour qu'il la simule.
const buildRealAccessLinkDomain = (
  outcome: ConsumeOutcome,
  loggerInstance: FakePinoLike,
) => {
  const now = new Date()
  const tokenHash = sha256Hex(TOKEN)
  const link: FakeLinkRow = {
    tokenHash,
    userId: 'user-1',
    usedAt: null,
    expiresAt:
      outcome === 'expired'
        ? new Date(now.getTime() - 1000)
        : new Date(now.getTime() + SEVEN_DAYS_MS),
  }
  const user: FakeUserRow = {
    id: 'user-1',
    deactivatedAt: outcome === 'deactivated' ? now : null,
  }
  const prisma = buildFakePrisma(link, user)
  const errorHandler = new ErrorHandler({
    logger: loggerInstance,
  } as unknown as IocContainer)
  const accessLinkRepository = new AccessLinkRepository({
    postgresOrm: { prisma },
    errorHandler,
  } as unknown as IocContainer)
  const userRepository = {
    updatePassword: () => Promise.resolve(),
  }
  return new AccessLinkDomain({
    accessLinkRepository,
    userRepository,
  } as unknown as IocContainer)
}

// Construit un serveur Fastify minimal (sans base de données) qui enregistre le VRAI routeur
// `accessLinkRouter` (pas une réimplémentation) avec le VRAI `AccessLinkDomain` (ci-dessus), la
// VRAIE chaîne de normalizers d'erreur, le VRAI gestionnaire de route inconnue
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
    logger: loggerInstance,
    accessLinkDomain: buildRealAccessLinkDomain(outcome, loggerInstance),
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

// Assertion complète : sur la sortie brute du JOURNAL (tous canaux, tous arguments), sur les
// EN-TÊTES de la réponse, et sur le CORPS de la réponse. Les trois ensemble sont « ce qui sort
// réellement vers le client et vers le terminal » (tour de correction 1, Important n°4), pas
// seulement le journal applicatif que la version précédente de ce fichier surveillait seule.
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
    'chemin %s (HTTP %i), a travers le VRAI domaine et le VRAI depot : le jeton et le mot de passe n apparaissent ni dans un journal (tous arguments compris), ni dans un en-tete, ni dans le corps, ni sur la sortie standard',
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

  // Tour de correction 2, mineur, puis tour de correction 3 (six formes voisines de plus) : la
  // troncature ne reconnaissait le préfixe qu'à l'octet près. Variantes de la MÊME route sabotée
  // (casse, encodage pourcent, double encodage, séparateur encodé, double slash, paramètre
  // matriciel `;...`, caractères blancs/invisibles glissés dans un segment, traversée de chemin
  // `.`/`..`) — toutes doivent tronquer identiquement.
  it.each<string>([
    `/AUTH/Access-Link/CONSUME/${TOKEN}`,
    `/auth/access-link/%63onsume/${TOKEN}`,
    `/auth/access-link/consume%2F${TOKEN}`,
    `/auth/access-link/%2563onsume/${TOKEN}`,
    `/auth//access-link/consume/${TOKEN}`,
    `/auth/access-link/consume;jsessionid=x/${TOKEN}`,
    // Tour de correction 3, mineur : six formes voisines fuyaient encore — caracteres blancs ou
    // invisibles glisses au milieu du segment, et traversee de chemin (`.`/`..`).
    `/auth/access-link/con%20sume/${TOKEN}`,
    `/auth/access-link/con%09sume/${TOKEN}`,
    `/auth/access-link/cons%00ume/${TOKEN}`,
    `/auth/access-link/cons%E2%80%8Bume/${TOKEN}`,
    `/auth/./access-link/consume/${TOKEN}`,
    `/auth/access-link/autre-route/../consume/${TOKEN}`,
  ])(
    'variante encodee/normalisee de la meme route sabotee (%s) ne fuit pas non plus',
    async (urlWithToken) => {
      const { app, allCalls } = buildApp('success')
      await app.register(accessLinkRouter, { prefix: '/auth/access-link' })
      await app.ready()

      let res: Awaited<ReturnType<typeof app.inject>> | undefined
      const stdWrites = await withCapturedStdWrites(async () => {
        res = await app.inject({ method: 'POST', url: urlWithToken })
      })
      if (!res) {
        throw new Error('no response captured')
      }

      expectNoLeak(TOKEN, allCalls, res, stdWrites)

      await app.close()
    },
  )

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

// Tour de correction 1 (revue, tâche 7, étape 4b) : le filet ci-dessus n'exerçait QUE la
// CONSOMMATION d'un lien (`POST /auth/access-link/consume`). La route qui ÉMET un jeton —
// `UserDomain.reissueAccessLink`, sous `/super-admin` — n'était couverte par AUCUN test de ce
// type ; seule une assertion ad hoc sur la ligne en base (`super-admin-access-link.test.ts`,
// tâche 7) en disait quelque chose, et elle ne dit rien du journal applicatif, des en-têtes de
// réponse, ni de la sortie standard — exactement ce que ce fichier surveille pour la route
// jumelle. Même harnais (VRAI `AccessLinkDomain`, VRAI `AccessLinkRepository`, faux Prisma en
// mémoire, VRAI `UserDomain`, VRAIS formateurs de journal, mêmes six niveaux de journal
// capturés), appliqué à cette route-ci.
//
// DIFFÉRENCE DÉLIBÉRÉE avec `expectNoLeak` ci-dessus : cette route REND le jeton dans le CORPS de
// la réponse, par construction — c'est le seul canal légitime (`accessLink.domain.ts#issue`,
// « le jeton en clair n'est rendu QU'ICI »). L'assertion porte donc sur les TROIS AUTRES canaux
// (journal, en-têtes, sortie standard), jamais sur le corps : un `expectNoLeak` inchangé
// rougirait ici sur le comportement voulu, pas sur une fuite.
//
// CE QUE CE HARNAIS NE COUVRE PAS : l'AUTORISATION de la route (`requireSuperAdmin`,
// `assertRoutePermission`) — ni `verifySessionCookie` ni `requireSuperAdmin` ne sont montés ici,
// `request.currentUser` est posé directement par un crochet local. Ce n'est pas un oubli : ce
// fichier n'a jamais exercé l'authentification d'aucune route (voir `buildApp` ci-dessus pour la
// consommation, elle aussi non authentifiée par nature) — il surveille ce qu'une route laisse
// fuiter UNE FOIS ATTEINTE, pas qui peut l'atteindre (couvert ailleurs :
// `src/test/e2e/super-admin-access-link.test.ts`, `global-auth-hook.test.ts`).
describe("le lien d'acces (POST /super-admin/users/:userId/access-link) ne fait fuir le jeton nulle part hors du corps", () => {
  const SUPER_ADMIN_ID = 'ckabcdefghij1234567890123'
  const TARGET_USER_ID = 'ckzyxwvutsrq9876543210987'

  // Assez large pour que le VRAI `AccessLinkRepository` fonctionne contre lui (même esprit que
  // `buildFakePrisma` ci-dessus) : `invalidateActiveForUser` (aucun lien actif à invalider ici)
  // puis `create`, les deux seuls appels de `AccessLinkDomain.issue`.
  const buildFakeAccessLinkPrisma = () => ({
    accessLink: {
      updateMany: () => Promise.resolve({ count: 0 }),
      create: () => Promise.resolve(),
    },
  })

  const buildReissueApp = (): {
    app: FastifyInstance
    allCalls: string[]
  } => {
    const { loggerInstance, allCalls } = buildCapturingLogger()

    const errorHandler = new ErrorHandler({
      logger: loggerInstance,
    } as unknown as IocContainer)
    const accessLinkRepository = new AccessLinkRepository({
      postgresOrm: { prisma: buildFakeAccessLinkPrisma() },
      errorHandler,
    } as unknown as IocContainer)
    // Compte cible : jamais désactivé, c'est tout ce que `reissueAccessLink` lui demande.
    const userRepository = {
      findByID: (userID: string) => Promise.resolve({ id: userID, deactivatedAt: null }),
    }
    const accessLinkDomain = new AccessLinkDomain({
      accessLinkRepository,
      userRepository,
    } as unknown as IocContainer)
    // Le bus RÉEL, sans souscripteur enregistré : `emit` reste un appel réel (pas un bouchon
    // muet), mais n'a ici aucun effet observable — la ligne de journal elle-même est déjà
    // éprouvée SANS jeton par `super-admin-access-link.test.ts` (assertion directe sur la ligne
    // en base), ce test-ci porte sur les canaux que celui-là ne regarde pas.
    const appEventBus = new AppEventBus()
    const userDomain = new UserDomain({
      userRepository,
      establishmentRepository: {},
      accessLinkDomain,
      activityLogRepository: {},
      tenantContext: {},
      postgresOrm: {},
      appEventBus,
    } as unknown as IocContainer)

    const app = Fastify({ loggerInstance, disableRequestLogging: true })
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)
    app.withTypeProvider<ZodTypeProvider>()
    app.iocContainer = { userDomain } as unknown as IocContainer
    app.setNotFoundHandler(notFoundHandler)
    app.setErrorHandler(
      buildErrorHandler(fastifyErrorNormalizer, boomErrorNormalizer),
    )

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
    // Remplace `verifySessionCookie` + `requireSuperAdmin`, absents de ce harnais (voir le
    // commentaire de tête) : pose directement l'acteur que la route lit.
    app.addHook('onRequest', (request) => {
      request.currentUser = { id: SUPER_ADMIN_ID, isSuperAdmin: true } as never
      return Promise.resolve()
    })

    return { app, allCalls }
  }

  it('le jeton apparait dans le corps de la reponse (attendu), jamais dans un journal, un en-tete ou la sortie standard', async () => {
    const { app, allCalls } = buildReissueApp()
    await app.register(usersRouter, { prefix: '/users' })
    await app.ready()

    let res: Awaited<ReturnType<typeof app.inject>> | undefined
    const stdWrites = await withCapturedStdWrites(async () => {
      res = await app.inject({
        method: 'POST',
        url: `/users/${TARGET_USER_ID}/access-link`,
      })
    })
    if (!res) {
      throw new Error('no response captured')
    }

    expect(res.statusCode).toBe(201)
    const { token } = res.json().accessLink as { token: string }
    expect(token.length).toBeGreaterThan(0)

    // LA différence avec `expectNoLeak` : le corps CONTIENT légitimement le jeton — c'est le
    // seul canal par lequel cette route peut le remettre à l'appelant.
    expect(res.payload).toContain(token)

    // Les trois AUTRES canaux ne doivent, eux, jamais le porter.
    for (const line of allCalls) {
      expect(line).not.toContain(token)
    }
    expect(JSON.stringify(res.headers)).not.toContain(token)
    for (const chunk of stdWrites) {
      expect(chunk).not.toContain(token)
    }

    await app.close()
  })
})
