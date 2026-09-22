import { ActivityLogRepository } from '../../../main/infra/orm/repositories/activityLog.repository'
import { DiagnosticEducatifRepository } from '../../../main/infra/orm/repositories/diagnosticEducatif.repository'
import { DiagnosticEducatifTemplateRepository } from '../../../main/infra/orm/repositories/diagnosticEducatifTemplate.repository'
import { LocationRepository } from '../../../main/infra/orm/repositories/location.repository'
import { PatientRepository } from '../../../main/infra/orm/repositories/patient.repository'
import { PlanningCycleRepository } from '../../../main/infra/orm/repositories/planningCycle.repository'
import { SoignantRepository } from '../../../main/infra/orm/repositories/soignant.repository'
import { ThematicRepository } from '../../../main/infra/orm/repositories/thematic.repository'
import { TodoRepository } from '../../../main/infra/orm/repositories/todo.repository'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { Tenant } from '../../../main/types/utils/tenant-context'
import { TenantContext } from '../../../main/utils/tenant-context'

type Call = { model: string; op: string; args: Record<string, unknown> }

// Clés de relation demandées par un `include`/`select` : pour une écriture
// (create/update/upsert), la réponse par défaut ne peut pas savoir résoudre
// une vraie relation Prisma — elle les remplace donc par un tableau vide
// plutôt que de renvoyer telle quelle la clause d'écriture (`{ create: […] }`
// n'est pas une réponse valide pour une relation incluse). Un test qui a
// besoin d'un contenu précis pour une relation incluse passe par `responses`.
const includedRelationKeys = (args: Record<string, unknown>): string[] => [
  ...Object.keys((args.include as object) ?? {}),
  ...Object.keys((args.select as object) ?? {}),
]

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
        if (op === 'findMany') {
          return Promise.resolve([])
        }
        if (op === 'count') {
          return Promise.resolve(0)
        }
        const row: Record<string, unknown> = { id: 'x', ...(args.data as object) }
        for (const relationKey of includedRelationKeys(args)) {
          row[relationKey] = []
        }
        return Promise.resolve(row)
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

describe('scoping des repositories de service simples', () => {
  it('ThematicRepository filtre, cree les liens soignants et aplatit la reponse', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new ThematicRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findAll()
      await repo.create({ name: 'T', soignantIDs: ['so1', 'so2'] })
      await repo.update('t1', { soignantIDs: ['so3'] })
    })
    expect(calls[0]).toMatchObject({
      model: 'thematic', op: 'findMany',
      args: { where: { serviceId: 's1' } },
    })
    expect(calls[1]).toMatchObject({
      model: 'thematic', op: 'create',
      args: {
        data: {
          name: 'T', serviceId: 's1', establishmentId: 'e1',
          soignantLinks: { create: [
            { soignantId: 'so1', serviceId: 's1', establishmentId: 'e1' },
            { soignantId: 'so2', serviceId: 's1', establishmentId: 'e1' },
          ] },
        },
      },
    })
    expect(calls[2]).toMatchObject({
      model: 'thematic', op: 'update',
      args: {
        where: { id_serviceId: { id: 't1', serviceId: 's1' } },
        data: { soignantLinks: { deleteMany: {}, create: [{ soignantId: 'so3' }] } },
      },
    })
  })

  it('TodoRepository ne voit que les taches du soignant courant', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new TodoRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findAll()
      await repo.create({ title: 't', createDate: new Date().toISOString(), completed: false } as never)
    })
    expect(calls[0]).toMatchObject({
      model: 'todo', op: 'findMany',
      args: { where: { serviceId: 's1', soignantID: 'so1' } },
    })
    expect(calls[1]).toMatchObject({
      model: 'todo', op: 'create',
      args: { data: { serviceId: 's1', establishmentId: 'e1', soignantID: 'so1' } },
    })
  })

  it('PlanningCycleRepository travaille par serviceId', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new PlanningCycleRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.find()
      await repo.upsert({ startOfWeek: new Date(), weekCount: 6 })
      await repo.delete()
    })
    expect(calls[0]).toMatchObject({
      model: 'planningCycle', op: 'findUnique',
      args: { where: { serviceId: 's1' } },
    })
    expect(calls[1]).toMatchObject({
      model: 'planningCycle', op: 'upsert',
      args: { where: { serviceId: 's1' }, create: { serviceId: 's1', establishmentId: 'e1', weekCount: 6 } },
    })
    expect(calls[2]).toMatchObject({
      model: 'planningCycle', op: 'deleteMany',
      args: { where: { serviceId: 's1' } },
    })
  })
})

describe('scoping des repositories de diagnostic', () => {
  it('DiagnosticEducatifRepository filtre, cree et met a jour avec les cles de tenant', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new DiagnosticEducatifRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findByPatientID('p1')
      await repo.findByID('d1')
      await repo.create({ patientId: 'p1', activeFields: [] } as never)
      await repo.update('d1', { title: 'T' })
      await repo.delete('d1')
    })
    expect(calls[0]).toMatchObject({
      model: 'diagnosticEducatif', op: 'findMany',
      args: { where: { patientId: 'p1', serviceId: 's1', establishmentId: 'e1' } },
    })
    expect(calls[1]).toMatchObject({
      model: 'diagnosticEducatif', op: 'findUniqueOrThrow',
      args: { where: { id_serviceId: { id: 'd1', serviceId: 's1' } } },
    })
    expect(calls[2]).toMatchObject({
      model: 'diagnosticEducatif', op: 'create',
      args: { data: { patientId: 'p1', serviceId: 's1', establishmentId: 'e1' } },
    })
    expect(calls[3]).toMatchObject({
      model: 'diagnosticEducatif', op: 'update',
      args: { where: { id_serviceId: { id: 'd1', serviceId: 's1' } }, data: { title: 'T' } },
    })
    expect(calls[4]).toMatchObject({
      model: 'diagnosticEducatif', op: 'delete',
      args: { where: { id_serviceId: { id: 'd1', serviceId: 's1' } } },
    })
  })

  it('DiagnosticEducatifTemplateRepository filtre, cree et met a jour avec les cles de tenant', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new DiagnosticEducatifTemplateRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findAll()
      await repo.findByID('dt1')
      await repo.create({ name: 'T', activeFields: [] })
      await repo.update('dt1', { name: 'T2' })
      await repo.delete('dt1')
    })
    expect(calls[0]).toMatchObject({
      model: 'diagnosticEducatifTemplate', op: 'findMany',
      args: { where: { serviceId: 's1', establishmentId: 'e1' } },
    })
    expect(calls[1]).toMatchObject({
      model: 'diagnosticEducatifTemplate', op: 'findUniqueOrThrow',
      args: { where: { id_serviceId: { id: 'dt1', serviceId: 's1' } } },
    })
    expect(calls[2]).toMatchObject({
      model: 'diagnosticEducatifTemplate', op: 'create',
      args: { data: { name: 'T', serviceId: 's1', establishmentId: 'e1' } },
    })
    expect(calls[3]).toMatchObject({
      model: 'diagnosticEducatifTemplate', op: 'update',
      args: { where: { id_serviceId: { id: 'dt1', serviceId: 's1' } }, data: { name: 'T2' } },
    })
    expect(calls[4]).toMatchObject({
      model: 'diagnosticEducatifTemplate', op: 'delete',
      args: { where: { id_serviceId: { id: 'dt1', serviceId: 's1' } } },
    })
  })
})
