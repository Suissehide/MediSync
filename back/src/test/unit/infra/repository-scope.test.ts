import { ActivityLogRepository } from '../../../main/infra/orm/repositories/activityLog.repository'
import { LocationRepository } from '../../../main/infra/orm/repositories/location.repository'
import { PatientRepository } from '../../../main/infra/orm/repositories/patient.repository'
import { SoignantRepository } from '../../../main/infra/orm/repositories/soignant.repository'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { Tenant } from '../../../main/types/utils/tenant-context'
import { TenantContext } from '../../../main/utils/tenant-context'

type Call = { model: string; op: string; args: Record<string, unknown> }

// Faux client : chaque `prisma.<model>.<op>(args)` est enregistré et renvoie
// une valeur neutre. `$transaction(fn)` rappelle fn avec le même faux client.
export const buildFakePrisma = () => {
  const calls: Call[] = []
  const handler = (model: string) =>
    new Proxy({}, {
      get: (_t, op: string) => (args: Record<string, unknown>) => {
        calls.push({ model, op, args })
        return Promise.resolve(op === 'findMany' ? [] : op === 'count' ? 0 : { id: 'x', ...(args.data as object) })
      },
    })
  const prisma: Record<string, unknown> = new Proxy({}, {
    get: (_t, model: string) => {
      if (model === '$transaction') {
        return (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]))
      }
      return handler(model)
    },
  })
  return { prisma, calls }
}

export const tenant: Tenant = {
  userId: 'u1', establishmentId: 'e1', establishmentRole: 'MEMBER',
  serviceId: 's1', serviceRole: 'INTERVENANT', soignantId: 'so1',
}

export const buildContainer = (prisma: unknown, tenantContext: TenantContext) =>
  ({
    postgresOrm: { prisma },
    tenantContext,
    errorHandler: { boomErrorFromPrismaError: ({ error }: { error: unknown }) => error },
  }) as unknown as IocContainer

describe('scoping des repositories d etablissement', () => {
  it('PatientRepository filtre et cree avec establishmentId', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new PatientRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findAll()
      await repo.findByID('p1')
      await repo.create({ firstName: 'A', lastName: 'B', createDate: new Date() } as never)
    })
    expect(calls[0]).toMatchObject({ model: 'patient', op: 'findMany', args: { where: { establishmentId: 'e1' } } })
    expect(calls[1]).toMatchObject({
      model: 'patient', op: 'findUniqueOrThrow',
      args: { where: { id_establishmentId: { id: 'p1', establishmentId: 'e1' } } },
    })
    expect(calls[2]).toMatchObject({ model: 'patient', op: 'create', args: { data: { establishmentId: 'e1' } } })
  })

  it('SoignantRepository et LocationRepository filtrent sur establishmentId', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const soignants = new SoignantRepository(buildContainer(prisma, ctx))
    const locations = new LocationRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await soignants.findAll()
      await soignants.update('so1', { name: 'N' })
      await locations.delete('l1')
    })
    expect(calls[0].args).toMatchObject({ where: { establishmentId: 'e1' } })
    expect(calls[1].args).toMatchObject({ where: { id_establishmentId: { id: 'so1', establishmentId: 'e1' } } })
    expect(calls[2].args).toMatchObject({ where: { id_establishmentId: { id: 'l1', establishmentId: 'e1' } } })
  })

  it('ActivityLogRepository pose le contexte du tenant a l ecriture, null hors requete', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new ActivityLogRepository(buildContainer(prisma, ctx))
    const params = {
      userID: 'u1', userFirstName: 'A', userLastName: 'B',
      action: 'create', entityType: 'Patient', entityID: 'p1',
    }

    await ctx.run(tenant, () => repo.create(params))
    await ctx.runAsSystem(() => repo.create(params))

    expect(calls[0]).toMatchObject({
      model: 'activityLog', op: 'create',
      args: { data: { establishmentId: 'e1', serviceId: 's1' } },
    })
    expect(calls[1]).toMatchObject({
      model: 'activityLog', op: 'create',
      args: { data: { establishmentId: null, serviceId: null } },
    })
  })

  it('ActivityLogRepository.findMany filtre par etablissement et service courant', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new ActivityLogRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, () => repo.findMany({ page: 1 }))

    expect(calls[0]).toMatchObject({
      model: 'activityLog', op: 'findMany',
      args: { where: { establishmentId: 'e1', serviceId: 's1' } },
    })
    expect(calls[1]).toMatchObject({
      model: 'activityLog', op: 'count',
      args: { where: { establishmentId: 'e1', serviceId: 's1' } },
    })
  })

  it('ActivityLogRepository.deleteOlderThan purge le tenant courant, ou toute la table hors requete', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new ActivityLogRepository(buildContainer(prisma, ctx))
    const date = new Date('2024-01-01')

    await ctx.run(tenant, () => repo.deleteOlderThan(date))
    await ctx.runAsSystem(() => repo.deleteOlderThan(date))

    expect(calls[0]).toMatchObject({
      model: 'activityLog', op: 'deleteMany',
      args: { where: { establishmentId: 'e1', serviceId: 's1', createdAt: { lt: date } } },
    })
    expect(calls[1]).toMatchObject({
      model: 'activityLog', op: 'deleteMany',
      args: { where: { createdAt: { lt: date } } },
    })
    expect(calls[1].args.where).not.toHaveProperty('establishmentId')
  })
})
