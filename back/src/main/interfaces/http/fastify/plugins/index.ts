import fastifyAccepts from '@fastify/accepts'
import fastifyCors, { type FastifyCorsOptions } from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fastifyGracefulShutdown from 'fastify-graceful-shutdown'
import fastifyPlugin from 'fastify-plugin'

import { registerPlugin } from '../util/fastify-plugin.registerer'
import { awilixPlugin } from './awilix.plugin'
import { cookiePlugin } from './cookie.plugin'
import { jwtPlugin } from './jwt.plugin'
import { ormPlugin } from './orm.plugin'

const plugins: FastifyPluginAsync = fastifyPlugin(
  async (fastify: FastifyInstance) => {
    const { iocContainer, log } = fastify
    const { config } = iocContainer
    log.info('Registering plugins')
    const shutdownOptions = { timeout: 5000 }
    if (process.env.CI) {
      await registerPlugin(
        fastify,
        'gracefulShutdown',
        fastifyGracefulShutdown,
        shutdownOptions,
      )
    }
    if (config.cookieSecret) {
      await registerPlugin(fastify, 'cookie', cookiePlugin)
    }
    if (config.jwtSecret) {
      await registerPlugin(fastify, 'jwt', jwtPlugin)
    }
    await registerPlugin(fastify, 'helmet', fastifyHelmet, {})
    // Limite de débit globale (anti-abus). Les routes d'auth ont une limite
    // plus stricte via leur `config.rateLimit`.
    await registerPlugin(fastify, 'rateLimit', fastifyRateLimit, {
      max: 300,
      timeWindow: '1 minute',
    })
    await registerPlugin<FastifyCorsOptions>(fastify, 'cors', fastifyCors, {
      // Ne jamais refléter une origine arbitraire avec credentials: on retombe
      // sur l'URL du front (toujours définie) si CORS_ORIGIN est absent.
      origin: config.corsOrigin ?? config.frontUrl,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
    await registerPlugin(fastify, 'accepts', fastifyAccepts)
    await registerPlugin(fastify, 'awilix', awilixPlugin)
    await registerPlugin(fastify, 'orm', ormPlugin)

    log.info('All plugins registered')
  },
)

export { plugins }
