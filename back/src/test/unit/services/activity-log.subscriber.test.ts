import { ActivityLogSubscriber } from '../../../main/services/activity-log.subscriber'
import { AppEventBus } from '../../../main/utils/app-event-bus'
import type { IocContainer } from '../../../main/types/application/ioc'
import { Prisma } from '../../../generated/client'

// task-5-re-review-3.md (re-revue du tour 5), "Ce qu'il reste" : ActivityLogSubscriber
// journalise `${err}` brut sur un depot (`activityLog.repository.ts`) qui n'a lui-meme aucun
// `catch` — ses trois methodes sont nues. Le `data` de `create` porte `userFirstName`/
// `userLastName`, des noms reels : un echec Prisma sur cette ecriture (colonne inconnue,
// contrainte violee, ...) recopie integralement ce `data` dans son message.
// Un seul mock de logger PARTAGE (modele `buildFakeLogger` de `error-handler.test.ts`) : toutes
// les methodes poussent dans la meme liste `calls`, pas seulement `error` dans un mock a part
// (task-5-re-review-4.md, I1). Sans ca, une fuite ecrite par un canal voisin (`warn`, `info`, ...)
// passe au vert alors que ce test la garde precisement pour l'empecher.
const buildSubscriber = () => {
  const calls: string[] = []
  const record = (message: string) => calls.push(message)
  const logger = {
    error: jest.fn(record),
    info: jest.fn(record),
    warn: jest.fn(record),
    debug: jest.fn(record),
    trace: jest.fn(record),
  }
  const appEventBus = new AppEventBus()
  const activityLogRepository = {
    create: jest.fn(),
    findMany: jest.fn(),
    deleteOlderThan: jest.fn(),
  }
  const userRepository = {
    findByID: jest.fn(async () => ({
      id: 'user-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
    })),
  }
  const container = {
    appEventBus,
    activityLogRepository,
    userRepository,
    logger,
  }
  // biome-ignore lint/correctness/noUnusedVariables: instancie pour son effet de bord (#subscribe)
  const subscriber = new ActivityLogSubscriber(container as unknown as IocContainer)
  return { appEventBus, activityLogRepository, userRepository, logger, calls }
}

// Attend que le premier appel a `logger.error` (fait, en dernier, par le `catch` de `#log`) ait
// eu lieu, sans dependre d'un delai arbitraire : `#log` est asynchrone et `emit` ne l'attend pas.
const waitForLoggedError = (logger: { error: jest.Mock }): Promise<void> =>
  new Promise((resolve) => {
    if (logger.error.mock.calls.length > 0) {
      resolve()
      return
    }
    logger.error.mockImplementation(() => resolve())
  })

describe("ActivityLogSubscriber – un echec d'ecriture ne fuit pas le nom de l'utilisateur", () => {
  const USER_FIRST_NAME = 'Marie-CONFIDENTIEL'
  const USER_LAST_NAME = 'Dupont-CONFIDENTIEL'

  const buildUnexpectedPrismaError = () =>
    new Prisma.PrismaClientValidationError(
      [
        'Invalid `this.prisma.activityLog.create()` invocation in',
        '/app/src/main/infra/orm/repositories/activityLog.repository.ts:38:33',
        '',
        `data: { userID: "user-1", userFirstName: "${USER_FIRST_NAME}", userLastName: "${USER_LAST_NAME}", action: "patient.created", entityType: "patient", entityID: "pat-1", SABOTAGE_COLONNE_INCONNUE: 1 }`,
        '',
        'Unknown argument `SABOTAGE_COLONNE_INCONNUE`. Available options are marked with ?.',
      ].join('\n'),
      { clientVersion: '0.0.0-test' },
    )

  it('ne journalise jamais le prenom/nom de l utilisateur quand le depot echoue', async () => {
    const { appEventBus, activityLogRepository, userRepository, logger, calls } =
      buildSubscriber()
    userRepository.findByID.mockResolvedValue({
      id: 'user-1',
      firstName: USER_FIRST_NAME,
      lastName: USER_LAST_NAME,
    })
    activityLogRepository.create.mockRejectedValue(
      buildUnexpectedPrismaError(),
    )

    const done = waitForLoggedError(logger)
    appEventBus.emit('patient.created', { userID: 'user-1', patientId: 'pat-1' })
    await done

    expect(logger.error).toHaveBeenCalledTimes(1)
    const [message] = logger.error.mock.calls[0] as [string]
    expect(message).not.toContain(USER_FIRST_NAME)
    expect(message).not.toContain(USER_LAST_NAME)
    expect(message).not.toContain('SABOTAGE_COLONNE_INCONNUE')
    expect(message).toContain('PrismaClientValidationError')

    // Tous les canaux, pas seulement `error` (task-5-re-review-4.md, I1) : un `logger.warn`
    // ajoute dans le `catch`, avant la ligne corrigee, doit faire rougir ce test.
    for (const line of calls) {
      expect(line).not.toContain(USER_FIRST_NAME)
      expect(line).not.toContain(USER_LAST_NAME)
      expect(line).not.toContain('SABOTAGE_COLONNE_INCONNUE')
    }
  })
})
