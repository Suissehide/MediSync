import type http from 'node:http'
import type {
  FastifyInstance,
  FastifyListenOptions,
  FastifyServerOptions,
} from 'fastify'
import Fastify from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'

import type { PinoLogger } from '../../../infra/logger/pino/pino-logger'
import type { IocContainer } from '../../../types/application/ioc'
import type { HttpServer } from '../../../types/interfaces/http/server'
import { toLocalhostIfLinux } from '../../../utils/url-helper'
import { buildErrorHandler } from './errors/error.handler'
import { boomErrorNormalizer } from './errors/normalizers/boom.error.normalizer'
import { fastifyErrorNormalizer } from './errors/normalizers/fastify.error.normalizer'
import { plugins } from './plugins'
import { routes } from './routes'
import { notFoundHandler } from './util/not-found.handler'
import { incomingRequestLog, requestCompletedLog } from './util/request-log'

declare module 'fastify' {
  export interface FastifyInstance {
    iocContainer: IocContainer
  }
}

class FastifyHttpServer implements HttpServer {
  private readonly fastify: FastifyInstance
  private _baseUrl!: string

  get baseUrl(): string | undefined {
    return this._baseUrl
  }

  get instance(): FastifyInstance {
    return this.fastify
  }

  constructor(iocContainer: IocContainer) {
    const pino = iocContainer.logger as PinoLogger

    const fastifyOptions: FastifyServerOptions = {
      loggerInstance: pino.pinoLogger,
      disableRequestLogging: true,
      exposeHeadRoutes: false,
      forceCloseConnections: 'idle',
      requestTimeout: 3000,
      // Etape 4a, tache 4, tour de correction 1, Important n°2, PUIS tour de correction 2,
      // Critique (la valeur du tour 1 etait une regression) : sans confiance explicite dans le
      // proxy, `request.ip` (donc la cle par defaut de `@fastify/rate-limit`,
      // `defaultKeyGenerator = (req) => req.ip`, node_modules/@fastify/rate-limit/index.js) vaut
      // l'adresse du DERNIER sauteur TCP. TOUTES les requetes de TOUS les utilisateurs
      // partageraient donc la meme adresse cote Fastify, et la limite de 10/minute sur
      // `/auth/sign-in`/`/auth/access-link/consume` serait partagee par tout le monde plutot
      // qu'appliquee par client.
      //
      // CE QUE LE TOUR 1 AVAIT FAIT DE FAUX — `trustProxy: 1` — mesure par exécution contre de
      // VRAIES connexions TCP (voir back/src/test/unit/interfaces/trust-proxy.test.ts) :
      // `getTrustProxyFn` (node_modules/fastify/lib/request.js) traduit un NOMBRE en
      // `(adresse, i) => i < n` — une confiance PUREMENT POSITIONNELLE, qui ne regarde JAMAIS qui
      // est réellement le pair TCP direct. N'importe quel appelant qui se connecte EN DIRECT
      // (sans passer par Traefik) est alors traité comme « le premier sauteur », et son propre
      // `X-Forwarded-For` — qu'il écrit lui-même — est honoré tel quel : la limite de débit
      // devenait contournable à volonté (25 requetes avec une adresse differente a chaque fois,
      // mesurees : zero refus, la de la limite mordait quinze fois des que ce reglage etait
      // retire).
      //
      // LE REMEDE, qui NE renvoie PAS la question a l'infrastructure (tour 2 : « le code peut se
      // proteger seul ») : une confiance PAR ADRESSE/PLAGE plutot que par POSITION —
      // `@fastify/proxy-addr` (dont Fastify se sert pour toute valeur non numerique) ne lit alors
      // `X-Forwarded-For` QUE si le pair TCP DIRECT appartient lui-meme a une des plages
      // ci-dessous ; sinon `request.ip` reste l'adresse reelle du socket, sans jamais consulter
      // l'en-tete. `uniquelocal` couvre les plages privees RFC1918
      // (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 — celle ou Docker place les reseaux definis
      // par l'utilisateur, dont `proxy`/`deploy/compose.yaml`, sans jamais en fixer l'adresse
      // exacte) ; `loopback`/`linklocal` couvrent les deux autres formes usuelles d'un saut de
      // confiance local.
      //
      // RESERVE (tour de correction 3 -- la version precedente etait trop rassurante, plus etroite
      // que la vraie breche mesuree). MESURE par execution : un appelant qui atteint le port
      // PUBLIE du conteneur `back` -- que ce soit un appel LOCAL (meme machine) ou un appel via
      // l'adresse RESEAU DE L'HOTE lui-meme (le port publie ecoute sur toutes les interfaces,
      // `ports: - '${PORT}:${PORT}'` dans `deploy/compose.yaml`, jamais modifie ici -- question de
      // deploiement, pas de code) -- voit son adresse traduite par Docker et ARRIVE au conteneur
      // comme une adresse PRIVEE, donc DANS la plage de confiance ci-dessus. Le residu n'est donc
      // pas limite a « un autre conteneur deja present sur le reseau Docker `proxy` » : il couvre
      // tout appelant qui atteint l'HOTE lui-meme, conteneur ou non.
      //
      // CE QUI RESTE NON VERIFIE, et qu'il ne faut pas non plus affirmer dans l'autre sens : pour
      // un appelant reellement EXTERNE (depuis l'internet public, atteignant l'adresse publique de
      // l'hote), la traduction d'adresse standard sur Docker/Linux (DNAT sans SNAT/hairpin)
      // PRESERVE l'adresse source d'origine -- le conteneur verrait alors une adresse PUBLIQUE,
      // hors de toute plage de confiance, et son en-tete resterait ignore. Rien dans ce depot ne
      // permet donc d'affirmer que la production, telle que reellement deployee (au-dela de ce que
      // `deploy/compose.yaml` decrit), est vulnerable par ce vecteur precis pour un appelant public
      // ordinaire -- ni de l'exclure pour de bon : les deux moities de cette reserve se lisent
      // ensemble, l'une n'efface pas l'autre.
      trustProxy: 'loopback,linklocal,uniquelocal',
    }

    this.fastify = Fastify(fastifyOptions)
    this.fastify.setValidatorCompiler(validatorCompiler)
    this.fastify.setSerializerCompiler(serializerCompiler)
    this.fastify.withTypeProvider<ZodTypeProvider>()
    this.fastify.iocContainer = iocContainer
  }

  async configure(): Promise<void> {
    const fastify = this.fastify
    const { log } = fastify
    fastify.addHook('onRoute', (routeOptions) => {
      log.debug(
        `Registered route: ${routeOptions.method.toString()} ${routeOptions.url}`,
      )
    })
    fastify.setNotFoundHandler(notFoundHandler)
    // `prismaErrorNormalizer` a ete retire (task-5-re-review-3.md, tour 5) : sa detection
    // (`error.type === 'PrismaClientKnownRequestError'`) ne correspond a aucun champ reel d'une
    // PrismaClientKnownRequestError (verifie contre une vraie instance : `.type` vaut toujours
    // `undefined`), donc il ne s'executait jamais. Une PrismaClientKnownRequestError qui atteint
    // ce point (parce qu'un depot l'a laissee s'echapper sans `catch`) tombe desormais sur le
    // dernier normalizer de la chaine (`errorNormalizer`, error.normalizer.ts), qui la traite deja
    // sans jamais recopier son message. Le remettre en etat de fonctionner aurait fait renvoyer
    // `error.message` — qui, pour une erreur Prisma non attrapee, peut porter integralement les
    // valeurs de l'ecriture qui a echoue.
    fastify.setErrorHandler(
      buildErrorHandler(fastifyErrorNormalizer, boomErrorNormalizer),
    )
    fastify.addHook('onRequest', (request) => {
      log.debug(incomingRequestLog(request.id, request.method, request.url))
      return Promise.resolve()
    })
    fastify.addHook('onResponse', (request, reply) => {
      const { elapsedTime } = reply
      const time = Math.round(elapsedTime)
      log.info(
        requestCompletedLog(
          request.id,
          request.method,
          request.url,
          reply.statusCode,
          time,
        ),
      )
      return Promise.resolve()
    })
    await fastify.register(plugins)
    await fastify.register(routes)
    await fastify.ready()
    log.trace(`Plugins registration details:\n${fastify.printPlugins()}`)
  }

  async start(): Promise<void> {
    const fastify = this.fastify
    const { iocContainer, log } = fastify
    const { config } = iocContainer
    const fastifyListenOptions: FastifyListenOptions = {
      ...(config.host && { host: config.host }),
      listenTextResolver: () => 'Server is listening',
      port: config.port,
    }
    log.trace(
      `Fastify listen options : ${JSON.stringify(fastifyListenOptions)}`,
    )
    const address = await fastify.listen(fastifyListenOptions)
    const baseUrl = toLocalhostIfLinux(address)
    log.info(`Server is ready: visit ${baseUrl}/`)
    this._baseUrl = baseUrl
  }

  async stop(): Promise<void> {
    const fastify = this.fastify
    const { log } = fastify
    log.info('Stopping server…')
    await fastify.close()
    log.trace('Server stopped')
  }

  getServer(): http.Server {
    return this.fastify.server
  }
}

export { FastifyHttpServer }
