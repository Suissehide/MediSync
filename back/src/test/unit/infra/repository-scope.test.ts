import { ActivityLogRepository } from '../../../main/infra/orm/repositories/activityLog.repository'
import { LocationRepository } from '../../../main/infra/orm/repositories/location.repository'
import { PatientRepository } from '../../../main/infra/orm/repositories/patient.repository'
import { SoignantRepository } from '../../../main/infra/orm/repositories/soignant.repository'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { Tenant } from '../../../main/types/utils/tenant-context'
import { TenantContext } from '../../../main/utils/tenant-context'

type Call = { model: string; op: string; args: Record<string, unknown> }

// Faux client : chaque `prisma.<model>.<op>(args)` est enregistré et renvoie
// une valeur neutre (ou celle fournie dans `responses`, indexée par
// `<model>.<op>`, pour les tests qui ont besoin de faire boucler le
// repository sur un résultat précis). `$transaction(fn)` rappelle fn avec le
// même faux client.
export const buildFakePrisma = (responses: Partial<Record<string, unknown>> = {}) => {
  const calls: Call[] = []
  const handler = (model: string) =>
    new Proxy({}, {
      get: (_t, op: string) => (args: Record<string, unknown>) => {
        calls.push({ model, op, args })
        const key = `${model}.${op}`
        if (key in responses) {
          return Promise.resolve(responses[key])
        }
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

describe('PatientRepository couvre les methodes de parcours', () => {
  it('getPathwaysForPatient filtre les parcours par service et les priorites par patient+service', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new PatientRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, () => repo.getPathwaysForPatient('p1'))

    expect(calls[0]).toMatchObject({
      model: 'pathway', op: 'findMany',
      args: {
        where: { serviceId: 's1', establishmentId: 'e1' },
        include: { patientPriorities: { where: { patientID: 'p1', serviceId: 's1' } } },
      },
    })
  })

  it('setPathwayPriorities supprime et recree les priorites avec les deux colonnes de tenant', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new PatientRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, () => repo.setPathwayPriorities('p1', ['pw1', 'pw2']))

    expect(calls[0]).toMatchObject({
      model: 'patientPathwayPriority', op: 'deleteMany',
      args: { where: { patientID: 'p1', serviceId: 's1', establishmentId: 'e1' } },
    })
    expect(calls[1]).toMatchObject({
      model: 'patientPathwayPriority', op: 'createMany',
      args: {
        data: [
          { patientID: 'p1', pathwayID: 'pw1', priority: 0, serviceId: 's1', establishmentId: 'e1' },
          { patientID: 'p1', pathwayID: 'pw2', priority: 1, serviceId: 's1', establishmentId: 'e1' },
        ],
      },
    })
  })

  it('countAppointmentsInPathway compte avec le filtre de service', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new PatientRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, () => repo.countAppointmentsInPathway('p1', 'pw1'))

    expect(calls[0]).toMatchObject({
      model: 'appointmentPatient', op: 'count',
      args: { where: { serviceId: 's1', establishmentId: 'e1', patientId: 'p1' } },
    })
  })

  it('removeFromPathway filtre la recherche par service et supprime via les cles composites id_serviceId', async () => {
    // Un seul rendez-vous, avec ce patient comme unique participant : la
    // branche "dernier patient" doit aussi supprimer le rendez-vous.
    const { prisma, calls } = buildFakePrisma({
      'appointmentPatient.findMany': [
        { id: 'ap1', appointment: { id: 'appt1', appointmentPatients: [{ id: 'ap1' }] } },
      ],
    })
    const ctx = new TenantContext()
    const repo = new PatientRepository(buildContainer(prisma, ctx))

    const result = await ctx.run(tenant, () => repo.removeFromPathway('p1', 'pw1'))

    expect(calls[0]).toMatchObject({
      model: 'appointmentPatient', op: 'findMany',
      args: { where: { serviceId: 's1', establishmentId: 'e1', patientId: 'p1' } },
    })
    expect(calls[1]).toMatchObject({
      model: 'appointmentPatient', op: 'delete',
      args: { where: { id_serviceId: { id: 'ap1', serviceId: 's1' } } },
    })
    expect(calls[2]).toMatchObject({
      model: 'appointment', op: 'delete',
      args: { where: { id_serviceId: { id: 'appt1', serviceId: 's1' } } },
    })
    expect(result).toEqual({ deletedAppointments: 1, removedFromGroup: 0 })
  })
})
