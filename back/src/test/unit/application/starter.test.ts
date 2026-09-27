import {
  scheduleActivityLogCleanup,
  schedulePatientAccessLogCleanup,
} from '../../../main/application/starter'
import type { IocContainer } from '../../../main/types/application/ioc'
import { Prisma } from '../../../generated/client'

// task-5-re-review-3.md (re-revue du tour 5), "Ce qu'il reste" : `starter.ts` journalise
// `${err}` brut sur un echec du nettoyage periodique du journal d'activite.
// `activityLogRepository.deleteOlderThan` n'a lui-meme aucun `catch` : une erreur Prisma brute
// peut donc arriver ici telle quelle.
describe("scheduleActivityLogCleanup – un echec de nettoyage ne journalise pas l'erreur brute", () => {
  const buildUnexpectedPrismaError = () =>
    new Prisma.PrismaClientValidationError(
      [
        'Invalid `this.prisma.activityLog.deleteMany()` invocation in',
        '/app/src/main/infra/orm/repositories/activityLog.repository.ts:95:41',
        '',
        'where: { createdAt: { lt: new Date(...) }, SABOTAGE_COLONNE_INCONNUE: 1 }',
        '',
        'Unknown argument `SABOTAGE_COLONNE_INCONNUE`. Available options are marked with ?.',
      ].join('\n'),
      { clientVersion: '0.0.0-test' },
    )

  it('ne journalise que la classe de l erreur, jamais son message brut', async () => {
    jest.useFakeTimers()
    // Un seul mock de logger PARTAGE (modele `buildFakeLogger` de `error-handler.test.ts`) :
    // toutes les methodes poussent dans la meme liste `calls`, pas seulement `error`
    // (task-5-re-review-4.md, I1) — sans ca, une fuite par un canal voisin (`info`, ici) passe
    // au vert.
    const calls: string[] = []
    const record = (message: string) => calls.push(message)
    const logger = {
      error: jest.fn(record),
      info: jest.fn(record),
      warn: jest.fn(record),
      debug: jest.fn(record),
    }
    let rejectCleanup: (err: unknown) => void = () => undefined
    const activityLogDomain = {
      cleanup: jest.fn(
        () =>
          new Promise<{ deleted: number }>((_resolve, reject) => {
            rejectCleanup = reject
          }),
      ),
    }
    const tenantContext = {
      runAsSystem: jest.fn((fn: () => Promise<unknown>) => fn()),
    }
    const instances = { activityLogDomain, logger, tenantContext } as unknown as IocContainer

    scheduleActivityLogCleanup(instances)
    rejectCleanup(buildUnexpectedPrismaError())
    // Laisse la chaine `.then().catch()` s'executer (microtaches), sans dependre d'un vrai delai.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(logger.error).toHaveBeenCalledTimes(1)
    const [message] = logger.error.mock.calls[0] as [string]
    expect(message).not.toContain('SABOTAGE_COLONNE_INCONNUE')
    expect(message).not.toContain('deleteMany')
    expect(message).toContain('PrismaClientValidationError')

    // Tous les canaux, pas seulement `error` (task-5-re-review-4.md, I1) : un `logger.info`
    // ajoute dans le `.catch()`, avant la ligne corrigee, doit faire rougir ce test.
    for (const line of calls) {
      expect(line).not.toContain('SABOTAGE_COLONNE_INCONNUE')
      expect(line).not.toContain('deleteMany')
    }

    jest.useRealTimers()
  })
})


// REVUE DE LA TACHE 8, Important : la purge NEUVE portait la meme promesse — « meme raison que
// le catch ci-dessus » — sans aucun test qui rougirait si elle cessait d'etre vraie. Mesure du
// relecteur : remplacer son `catch` par `logger.error(`... ${err}`)` laissait les 521 tests
// verts. Le `describe` ci-dessus n'importait que `scheduleActivityLogCleanup`.
//
// Meme propriete, meme forme, sur l'autre journal. Le depot de `PatientAccessLog` n'a pas plus
// de `catch` propre que celui d'`ActivityLog` : une erreur Prisma brute y recopie le `data` de
// l'operation ratee, `where` compris.
describe("schedulePatientAccessLogCleanup – un echec de nettoyage ne journalise pas l'erreur brute", () => {
  it('ne journalise que la classe de l erreur, jamais son message brut', async () => {
    jest.useFakeTimers()
    const calls: string[] = []
    const record = (message: string) => calls.push(message)
    const logger = {
      error: jest.fn(record),
      info: jest.fn(record),
      warn: jest.fn(record),
      debug: jest.fn(record),
    }
    let rejectCleanup: (err: unknown) => void = () => undefined
    const patientAccessLogDomain = {
      cleanup: jest.fn(
        () =>
          new Promise<{ deleted: number }>((_resolve, reject) => {
            rejectCleanup = reject
          }),
      ),
    }
    const tenantContext = {
      runAsSystem: jest.fn((fn: () => Promise<unknown>) => fn()),
    }
    const instances = {
      patientAccessLogDomain,
      logger,
      tenantContext,
    } as unknown as IocContainer

    schedulePatientAccessLogCleanup(instances)
    rejectCleanup(
      new Prisma.PrismaClientValidationError(
        [
          'Invalid `this.prisma.patientAccessLog.deleteMany()` invocation in',
          '/app/src/main/infra/orm/repositories/patientAccessLog.repository.ts:1:1',
          '',
          'where: { createdAt: { lt: new Date(...) }, SABOTAGE_COLONNE_INCONNUE: 1 }',
          '',
          'Unknown argument `SABOTAGE_COLONNE_INCONNUE`. Available options are marked with ?.',
        ].join('\n'),
        { clientVersion: '0.0.0-test' },
      ),
    )
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(logger.error).toHaveBeenCalledTimes(1)
    const [message] = logger.error.mock.calls[0] as [string]
    expect(message).not.toContain('SABOTAGE_COLONNE_INCONNUE')
    expect(message).not.toContain('deleteMany')
    expect(message).toContain('PrismaClientValidationError')

    // Tous les canaux, pas seulement `error` : une fuite par un canal voisin doit rougir aussi.
    for (const line of calls) {
      expect(line).not.toContain('SABOTAGE_COLONNE_INCONNUE')
      expect(line).not.toContain('deleteMany')
    }

    jest.useRealTimers()
  })
})
