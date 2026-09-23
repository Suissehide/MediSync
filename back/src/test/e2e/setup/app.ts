import type { FastifyInstance } from 'fastify'

import { loadConfig } from '../../../main/application/config'
import { startIocContainer } from '../../../main/application/starter'
import type { IocContainer } from '../../../main/types/application/ioc'
import '../../../main/utils/date'

export type TestApp = {
  app: FastifyInstance
  instances: IocContainer
  close: () => Promise<void>
}

// Construit le container et configure Fastify sans `listen` : les tests
// passent par `app.inject`. La config lit `.env.test` via `with:dotenv`.
export const buildTestApp = async (): Promise<TestApp> => {
  const config = loadConfig()
  const container = startIocContainer(config)
  const { httpServer } = container.instances
  await httpServer.configure()
  return {
    app: httpServer.instance,
    instances: container.instances,
    close: () => httpServer.stop(),
  }
}
