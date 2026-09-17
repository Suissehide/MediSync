import { PlanningCycleDomain } from '../../../main/domain/planningCycle.domain'
import type { IocContainer } from '../../../main/types/application/ioc'
import type {
  PlanningCycleEntityRepo,
  PlanningCycleUpsertEntityRepo,
} from '../../../main/types/infra/orm/repositories/planningCycle.repository.interface'

// Repository factice : on ne teste ici que les règles du domaine, pas Prisma.
const buildDomain = () => {
  const upserts: PlanningCycleUpsertEntityRepo[] = []
  let deleteCalls = 0

  const planningCycleRepository = {
    find: () => Promise.resolve(null),
    upsert: (params: PlanningCycleUpsertEntityRepo) => {
      upserts.push(params)
      return Promise.resolve({
        id: 'default',
        startOfWeek: params.startOfWeek,
        weekCount: params.weekCount,
        updatedAt: new Date('2026-09-17T00:00:00.000Z'),
      } as PlanningCycleEntityRepo)
    },
    delete: () => {
      deleteCalls += 1
      return Promise.resolve()
    },
  }

  const domain = new PlanningCycleDomain({
    planningCycleRepository,
  } as unknown as IocContainer)

  return { domain, upserts, getDeleteCalls: () => deleteCalls }
}

describe('PlanningCycleDomain', () => {
  it('ramene une date de milieu de semaine au lundi de cette semaine', async () => {
    const { domain, upserts } = buildDomain()

    // Jeudi 8 janvier 2026 -> lundi 5 janvier 2026.
    await domain.save({
      startOfWeek: new Date('2026-01-08T15:30:00.000Z'),
      weekCount: 6,
    })

    expect(upserts).toHaveLength(1)
    const [entry] = upserts
    expect(entry?.startOfWeek.toISOString()).toBe('2026-01-05T00:00:00.000Z')
  })

  it('laisse un lundi inchange', async () => {
    const { domain, upserts } = buildDomain()

    await domain.save({
      startOfWeek: new Date('2026-01-05T00:00:00.000Z'),
      weekCount: 4,
    })

    const [entry] = upserts
    expect(entry?.startOfWeek.toISOString()).toBe('2026-01-05T00:00:00.000Z')
  })

  it('ramene un dimanche au lundi qui precede', async () => {
    const { domain, upserts } = buildDomain()

    // Dimanche 11 janvier 2026 -> lundi 5 janvier 2026.
    await domain.save({
      startOfWeek: new Date('2026-01-11T12:00:00.000Z'),
      weekCount: 6,
    })

    const [entry] = upserts
    expect(entry?.startOfWeek.toISOString()).toBe('2026-01-05T00:00:00.000Z')
  })

  it('rejette un weekCount inferieur a 1', async () => {
    const { domain, upserts } = buildDomain()

    await expect(
      domain.save({
        startOfWeek: new Date('2026-01-05T00:00:00.000Z'),
        weekCount: 0,
      }),
    ).rejects.toThrow()
    expect(upserts).toHaveLength(0)
  })

  it('rejette un weekCount superieur a 52', async () => {
    const { domain, upserts } = buildDomain()

    await expect(
      domain.save({
        startOfWeek: new Date('2026-01-05T00:00:00.000Z'),
        weekCount: 53,
      }),
    ).rejects.toThrow()
    expect(upserts).toHaveLength(0)
  })

  it('rejette un weekCount non entier', async () => {
    const { domain, upserts } = buildDomain()

    await expect(
      domain.save({
        startOfWeek: new Date('2026-01-05T00:00:00.000Z'),
        weekCount: 2.5,
      }),
    ).rejects.toThrow()
    expect(upserts).toHaveLength(0)
  })

  it('accepte les bornes 1 et 52', async () => {
    const { domain, upserts } = buildDomain()

    await domain.save({
      startOfWeek: new Date('2026-01-05T00:00:00.000Z'),
      weekCount: 1,
    })
    await domain.save({
      startOfWeek: new Date('2026-01-05T00:00:00.000Z'),
      weekCount: 52,
    })

    expect(upserts.map((u) => u.weekCount)).toEqual([1, 52])
  })

  it('delegue la suppression au repository', async () => {
    const { domain, getDeleteCalls } = buildDomain()

    await domain.delete()

    expect(getDeleteCalls()).toBe(1)
  })
})
