import { scheduleActivityLogCleanup } from '../../../main/application/starter'
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
    const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }
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

    jest.useRealTimers()
  })
})
