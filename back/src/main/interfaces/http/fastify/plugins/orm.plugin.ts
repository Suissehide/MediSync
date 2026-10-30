import type { FastifyInstance } from 'fastify'
import type { FastifyPluginAsync } from 'fastify/types/plugin'
import fastifyPlugin from 'fastify-plugin'

const ormPlugin: FastifyPluginAsync = fastifyPlugin(
  (fastify: FastifyInstance) => {
    const { postgresOrm, appEventBus } = fastify.iocContainer
    fastify.addHook('onReady', async () => {
      await postgresOrm.start()
    })
    fastify.addHook('onClose', async () => {
      await appEventBus.idle()
      await postgresOrm.stop()
    })
    return Promise.resolve()
  },
)

export { ormPlugin }
