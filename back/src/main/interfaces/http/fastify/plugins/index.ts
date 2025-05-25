import fastifyAccepts from '@fastify/accepts'
import fastifyCors, { type FastifyCorsOptions } from '@fastify/cors'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fastifyGracefulShutdown from 'fastify-graceful-shutdown'
import fastifyPlugin from 'fastify-plugin'
import { registerPlugin } from '../util/fastify-plugin.registerer'
import { apidocPlugin } from './apidoc.plugin'
import { awilixPlugin } from './awilix.plugin'
import { jwtPlugin } from './jwt.plugin'
import { ormPlugin } from './orm.plugin'
import { cookiePlugin } from './cookie.plugin'

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
    await registerPlugin<FastifyCorsOptions>(fastify, 'cors', fastifyCors, {
      origin: 'http://localhost:4269',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
    await registerPlugin(fastify, 'accepts', fastifyAccepts)
    await registerPlugin(fastify, 'apidoc', apidocPlugin)
    await registerPlugin(fastify, 'awilix', awilixPlugin)
    await registerPlugin(fastify, 'orm', ormPlugin)

    log.info('All plugins registered')
  },
)

export { plugins }
