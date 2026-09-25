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
// pour éviter une croissance non bornée de la table. Hors de toute requête :
// encadrée par runAsSystem pour que le repository purge toute la table plutôt
// qu'un tenant particulier.
const scheduleActivityLogCleanup = (instances: IocContainer): void => {
  const { activityLogDomain, logger, tenantContext } = instances
  const run = (): void => {
    tenantContext
      .runAsSystem(() => activityLogDomain.cleanup())
      .then(({ deleted }) =>
        logger.info(`ActivityLog cleanup: ${deleted} entrées supprimées`),
      )
      .catch((err) => {
        // Jamais `${err}` : `activityLogRepository.deleteOlderThan` n'a aucun `catch`
        // (task-5-re-review-3.md, tour 5), donc une erreur Prisma brute peut arriver ici
        // telle quelle. Seule sa classe, qui ne peut jamais porter une valeur soumise, va
        // au journal.
        const errorClass = err instanceof Error ? err.constructor.name : typeof err
        logger.error(`ActivityLog cleanup failed [${errorClass}]`)
      })
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

export { startApp, startIocContainer, scheduleActivityLogCleanup }
