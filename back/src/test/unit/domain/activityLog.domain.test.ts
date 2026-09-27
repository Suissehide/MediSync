import { ActivityLogDomain } from '../../../main/domain/activityLog.domain'

// Tache 8, etape 4b : la retention (config.logRetentionMonths) doit gouverner la purge, jamais
// une valeur de douze mois recopiee en dur dans le domaine. Sabotage etroit eprouve par
// execution : remettre `12` en dur ICI SEUL fait rougir ce test-ci, et lui seul (voir
// patientAccessLog.domain.test.ts pour l'equivalent de l'autre journal, calcule
// independamment).
describe('ActivityLogDomain.cleanup', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('purge a la duree configuree, pas a douze mois en dur', async () => {
    jest.useFakeTimers()
    const repository = { deleteOlderThan: jest.fn().mockResolvedValue(0) }
    const domain = new ActivityLogDomain({
      activityLogRepository: repository,
      config: { logRetentionMonths: 3 },
    } as never)
    jest.setSystemTime(new Date('2026-09-27T00:00:00Z'))

    await domain.cleanup()

    expect(repository.deleteOlderThan).toHaveBeenCalledWith(new Date('2026-06-27T00:00:00Z'))
  })
})
