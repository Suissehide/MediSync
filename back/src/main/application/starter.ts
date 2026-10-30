import { loadConfig } from './config'
import { AwilixIocContainer } from './ioc/awilix/awilix-ioc-container'
import '../utils/date'

import type { Config } from '../types/application/config'
import type { IocContainer } from '../types/application/ioc'

const startIocContainer = (config: Config): AwilixIocContainer => {
  return new AwilixIocContainer(config)
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

// Purge périodique du journal d'activité (rétention paramétrable côté domaine,
// `config.logRetentionMonths`, douze mois par défaut), pour éviter une
// croissance non bornée de la table. Hors de toute requête :
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
        // Jamais `${err}` : `activityLogRepository.deleteOlderThan` n'a aucun `catch`,
        // donc une erreur Prisma brute peut arriver ici telle quelle. Seule sa classe,
        // qui ne peut jamais porter une valeur soumise, va au journal.
        const errorClass =
          err instanceof Error ? err.constructor.name : typeof err
        logger.error(`ActivityLog cleanup failed [${errorClass}]`)
      })
  }
  const timer = setInterval(run, ONE_DAY_MS)
  timer.unref?.()
  run()
}

// Purge périodique du journal des consultations : même mécanisme, même
// rétention paramétrable (indépendante, voir le commentaire de
// `PatientAccessLogDomain.cleanup`), à côté de la purge existante ci-dessus.
//
// SECOND APPEL du PREMIER emploi déclaré de `runAsSystem` — l'entrée
// `application/starter.ts` de `runAsSystem-unicite.test.ts` porte
// `appels: 3` (le troisième : `scheduleNotifications`). La convention du fichier cité compte SEPT emplois déclarés —
// un par fichier, avec sa raison — pour ONZE appels au total ; ce site-ci
// n'en ouvre aucun nouveau, il s'ajoute au premier.
//
// RAPPEL `async` AVEC UN `await` INTERNE, et non le rappel synchrone nu de la
// purge ci-dessus. Ce n'est PAS parce que l'enrobage `async` tiendrait la
// portée du contexte — `back/CLAUDE.md`, l'annexe des décisions et
// `utils/tenant-context.ts#runAsSuperAdmin` nomment cet énoncé comme un
// SYMPTÔME. L'énoncé exact est : **la lecture du contexte doit survenir
// avant le premier point de suspension**. Les DEUX formes sont donc
// correctes ici, et la voisine synchrone nue le prouve — les deux
// `deleteOlderThan` lisent `tenantContext.peek()` synchroniquement en tête de
// leur corps. Ce qui reste de l'écart entre les deux purges est purement une
// affaire de lint et de lisibilité (`suspicious/useAwait` refuse un rappel
// `async` sans `await`), pas de correction : ne pas lire cet `async` comme la
// condition qui tient la portée, ni la voisine comme une exception tolérée.
const schedulePatientAccessLogCleanup = (instances: IocContainer): void => {
  const { patientAccessLogDomain, logger, tenantContext } = instances
  const run = (): void => {
    tenantContext
      .runAsSystem(async () => {
        return await patientAccessLogDomain.cleanup()
      })
      .then(({ deleted }) =>
        logger.info(`PatientAccessLog cleanup: ${deleted} entrées supprimées`),
      )
      .catch((err) => {
        // Même raison que le `catch` de `scheduleActivityLogCleanup` ci-dessus :
        // `patientAccessLogRepository.deleteOlderThan` n'a lui non plus aucun `catch`
        // propre. Seule la classe de l'erreur va au journal.
        const errorClass =
          err instanceof Error ? err.constructor.name : typeof err
        logger.error(`PatientAccessLog cleanup failed [${errorClass}]`)
      })
  }
  const timer = setInterval(run, ONE_DAY_MS)
  timer.unref?.()
  run()
}

const FIFTEEN_MIN_MS = 15 * 60 * 1000

// Planification des notifications (rappels, diagnostic, fin de parcours, echeances, purge) — troisieme appel de runAsSystem de ce fichier.
const scheduleNotifications = (instances: IocContainer): void => {
  const { notificationScheduler, logger, tenantContext } = instances
  const run = (): void => {
    tenantContext
      .runAsSystem(async () => {
        return await notificationScheduler.runOnce(new Date())
      })
      .then(({ created, purged }) =>
        logger.info(`Notifications: ${created} créées, ${purged} purgées`),
      )
      .catch((err) => {
        const errorClass =
          err instanceof Error ? err.constructor.name : typeof err
        logger.error(`Notifications schedule failed [${errorClass}]`)
      })
  }
  const timer = setInterval(run, FIFTEEN_MIN_MS)
  timer.unref?.()
  run()
}

const ONE_MINUTE_MS = 60 * 1000

// Envoi des e-mails de notification (immediat ou resume quotidien a 7h Paris) — quatrieme appel de runAsSystem de ce fichier.
const scheduleNotificationMails = (instances: IocContainer): void => {
  const { notificationMailer, logger, tenantContext } = instances
  const run = (): void => {
    tenantContext
      .runAsSystem(async () => {
        return await notificationMailer.runOnce(new Date())
      })
      .then(({ sent, digests, skipped }) => {
        if (sent + digests + skipped > 0) {
          logger.info(
            `Notification mails: ${sent} envoyés, ${digests} résumés, ${skipped} ignorés`,
          )
        }
      })
      .catch((err) => {
        const errorClass =
          err instanceof Error ? err.constructor.name : typeof err
        logger.error(`Notification mails schedule failed [${errorClass}]`)
      })
  }
  const timer = setInterval(run, ONE_MINUTE_MS)
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
  schedulePatientAccessLogCleanup(iocContainer.instances)
  scheduleNotifications(iocContainer.instances)
  scheduleNotificationMails(iocContainer.instances)

  return iocContainer.instances
}

export {
  scheduleActivityLogCleanup,
  scheduleNotificationMails,
  scheduleNotifications,
  schedulePatientAccessLogCleanup,
  startApp,
  startIocContainer,
}
