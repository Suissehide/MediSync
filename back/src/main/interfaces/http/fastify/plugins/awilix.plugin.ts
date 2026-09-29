import { fastifyAwilixPlugin } from '@fastify/awilix'
import type { FastifyPluginAsync } from 'fastify'

const awilixPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyAwilixPlugin, {
    disposeOnClose: true,
    disposeOnResponse: true,
    strictBooleanEnforced: true,
  })
}

export { awilixPlugin }
