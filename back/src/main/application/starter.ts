import { loadConfig } from './config'
import { AwilixIocContainer } from './ioc/awilix/awilix-ioc-container'
import '../utils/date'
import type { Config } from '../types/application/config'
import type { IocContainer } from '../types/application/ioc'

const startIocContainer = (config: Config): AwilixIocContainer => {
  return new AwilixIocContainer(config)
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

// Purge périodique du journal d'activité (rétention 12 mois côté domaine),
// pour éviter une croissance non bornée de la table.
const scheduleActivityLogCleanup = (instances: IocContainer): void => {
  const { activityLogDomain, logger } = instances
  const run = (): void => {
    activityLogDomain
      .cleanup()
      .then(({ deleted }) =>
        logger.info(`ActivityLog cleanup: ${deleted} entrées supprimées`),
      )
      .catch((err) => logger.error(`ActivityLog cleanup failed: ${err}`))
  }
  const timer = setInterval(run, ONE_DAY_MS)
  timer.unref?.()
  run()
}

const startApp = async (): Promise<IocContainer> => {
  const config = loadConfig()
  const iocContainer = startIocContainer(config)
  const { httpServer } = iocContainer.instances

  await httpServer.configure()
  await httpServer.start()

  scheduleActivityLogCleanup(iocContainer.instances)

  return iocContainer.instances
}

export { startApp, startIocContainer }
