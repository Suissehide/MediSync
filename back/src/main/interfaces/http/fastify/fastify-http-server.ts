import type http from 'node:http'
import type {
  FastifyInstance,
  FastifyListenOptions,
  FastifyServerOptions,
} from 'fastify'
import Fastify from 'fastify'
import type { IocContainer } from '../../../types/application/ioc'
import type { HttpServer } from '../../../types/interfaces/http/server'
import { pathWithoutQuery, toLocalhostIfLinux } from '../../../utils/url-helper'
import { buildErrorHandler } from './errors/error.handler'
import { boomErrorNormalizer } from './errors/normalizers/boom.error.normalizer'
import { fastifyErrorNormalizer } from './errors/normalizers/fastify.error.normalizer'
import { plugins } from './plugins'
import { routes } from './routes'
import { notFoundHandler } from './util/not-found.handler'
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import type { PinoLogger } from '../../../infra/logger/pino/pino-logger'

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
      log.debug(
        `Incoming request (#${request.id}): ${request.method} ${pathWithoutQuery(request.url)}`,
      )
      return Promise.resolve()
    })
    fastify.addHook('onResponse', (request, reply) => {
      const { elapsedTime } = reply
      const time = Math.round(elapsedTime)
      log.info(
        `Request completed (#${request.id}): ${request.method} ${pathWithoutQuery(request.url)} [HTTP ${reply.statusCode}] (${time}ms)`,
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
