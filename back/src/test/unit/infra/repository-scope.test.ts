import { ActivityLogRepository } from '../../../main/infra/orm/repositories/activityLog.repository'
import { DiagnosticEducatifRepository } from '../../../main/infra/orm/repositories/diagnosticEducatif.repository'
import { DiagnosticEducatifTemplateRepository } from '../../../main/infra/orm/repositories/diagnosticEducatifTemplate.repository'
import { LocationRepository } from '../../../main/infra/orm/repositories/location.repository'
import { PathwayRepository } from '../../../main/infra/orm/repositories/pathway.repository'
import { PathwayTemplateRepository } from '../../../main/infra/orm/repositories/pathwayTemplate.repository'
import { PatientRepository } from '../../../main/infra/orm/repositories/patient.repository'
import { PlanningCycleRepository } from '../../../main/infra/orm/repositories/planningCycle.repository'
import { SlotRepository } from '../../../main/infra/orm/repositories/slot.repository'
import { SlotTemplateRepository } from '../../../main/infra/orm/repositories/slotTemplate.repository'
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
        if (op === 'findMany' || op === 'groupBy') {
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

describe('scoping slotTemplate et slot', () => {
  it('SlotTemplateRepository cree avec liens et scope, filtre updateMany', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new SlotTemplateRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.create({
        startTime: new Date(), endTime: new Date(), offsetDays: 0,
        isIndividual: true, color: '#fff', soignantIDs: ['so1'],
      } as never)
      await repo.updateMany(['a', 'b'], { color: '#000' })
    })
    expect(calls[0]).toMatchObject({
      model: 'slotTemplate', op: 'create',
      args: {
        data: {
          serviceId: 's1', establishmentId: 'e1',
          soignantLinks: { create: [{ soignantId: 'so1', serviceId: 's1', establishmentId: 'e1' }] },
        },
      },
    })
    expect(calls[1]).toMatchObject({
      model: 'slotTemplate', op: 'updateMany',
      args: { where: { id: { in: ['a', 'b'] }, serviceId: 's1' } },
    })
  })

  it('SlotRepository filtre la fenetre de dates par service', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new SlotRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findAll({ from: new Date('2026-01-01'), to: new Date('2026-02-01') })
      await repo.delete('sl1')
    })
    expect(calls[0]).toMatchObject({
      model: 'slot', op: 'findMany',
      args: { where: { serviceId: 's1', endDate: { gt: expect.any(Date) } } },
    })
    expect(calls[1]).toMatchObject({
      model: 'slot', op: 'delete',
      args: { where: { id_serviceId: { id: 'sl1', serviceId: 's1' } } },
    })
  })

  it('SlotRepository.update remplace les liens soignants du modele puis filtre la mise a jour du creneau', async () => {
    // Reponse explicite pour `slot.update` : la relation `slotTemplate` est
    // a un seul enregistrement, pas une liste — le faux client par defaut
    // (tableau vide sur toute cle incluse) ne convient pas ici.
    const { prisma, calls } = buildFakePrisma({
      'slot.update': { id: 'sl1', slotTemplate: { soignantLinks: [] } },
    })
    const ctx = new TenantContext()
    const repo = new SlotRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, () =>
      repo.update('sl1', {
        locked: true,
        slotTemplate: { id: 'st1', soignantIDs: ['so2'] },
      } as never),
    )
    expect(calls[0]).toMatchObject({
      model: 'slotTemplate', op: 'update',
      args: {
        where: { id_serviceId: { id: 'st1', serviceId: 's1' } },
        data: {
          soignantLinks: {
            deleteMany: {},
            create: [{ soignantId: 'so2', serviceId: 's1', establishmentId: 'e1' }],
          },
        },
      },
    })
    // La suppression des anciens liens doit precéder la creation des
    // nouveaux dans l'objet d'ecriture imbriquee (ordre des cles).
    const soignantLinksWrite = (calls[0].args.data as { soignantLinks: object }).soignantLinks
    expect(Object.keys(soignantLinksWrite)).toEqual(['deleteMany', 'create'])
    expect(calls[1]).toMatchObject({
      model: 'slot', op: 'update',
      args: {
        where: { id_serviceId: { id: 'sl1', serviceId: 's1' } },
        data: { locked: true },
      },
    })
  })
})

describe('scoping pathwayTemplate et pathway', () => {
  it('PathwayTemplateRepository filtre et reordonne dans le service', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new PathwayTemplateRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findAll()
      await repo.reorder(['a', 'b'])
      await repo.create({ name: 'N', color: '#fff', mainTag: 't' } as never)
    })
    expect(calls[0]).toMatchObject({
      model: 'pathwayTemplate', op: 'findMany',
      args: { where: { serviceId: 's1' }, orderBy: { displayOrder: 'asc' } },
    })
    expect(calls[1]).toMatchObject({
      model: 'pathwayTemplate', op: 'update',
      args: { where: { id_serviceId: { id: 'a', serviceId: 's1' } }, data: { displayOrder: 0 } },
    })
    expect(calls[3]).toMatchObject({
      model: 'pathwayTemplate', op: 'create',
      args: { data: { name: 'N', serviceId: 's1', establishmentId: 'e1' } },
    })
  })

  it('PathwayRepository filtre les recherches par tag et le suivi mensuel', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new PathwayRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findByTemplateTagAndDate('tag', new Date())
      await repo.findTracking(2026, 3)
      await repo.create({ startDate: '2026-03-02', templateID: 'pt', slotIDs: ['sl'] } as never)
    })
    expect(calls[0]).toMatchObject({
      model: 'pathway', op: 'findMany',
      args: { where: { serviceId: 's1', template: { mainTag: 'tag' } } },
    })
    expect(calls[1]).toMatchObject({
      model: 'pathway', op: 'findMany',
      args: { where: { serviceId: 's1' } },
    })
    expect(calls[2]).toMatchObject({
      model: 'slot', op: 'groupBy',
      args: { where: { pathwayID: { in: [] }, serviceId: 's1' } },
    })
    expect(calls[3]).toMatchObject({
      model: 'pathway', op: 'create',
      args: {
        data: {
          serviceId: 's1', establishmentId: 'e1', templateID: 'pt',
          slots: { connect: [{ id_serviceId: { id: 'sl', serviceId: 's1' } }] },
        },
      },
    })
  })

  it('PathwayRepository.regenerate filtre chaque operation de la transaction et protege les modeles maitres', async () => {
    // Une thematique existante et un modele de creneau maitre, avec un
    // parcours deja instancie qui porte un creneau vide (aucun rendez-vous)
    // sur un modele clone (templateID null) : la regeneration doit purger
    // ce creneau vide et son clone, puis recreer le pas de programme.
    const { prisma, calls } = buildFakePrisma({
      'pathwayTemplate.findUnique': {
        id: 'pt1',
        slotTemplates: [{
          id: 'stMaster1',
          startTime: new Date('1970-01-01T09:00:00.000Z'),
          endTime: new Date('1970-01-01T10:00:00.000Z'),
          offsetDays: 0,
          isIndividual: true,
          capacity: null,
          thematicId: null,
          locationID: null,
          description: null,
          color: '#fff',
          soignantLinks: [{ soignantId: 'so1' }],
        }],
      },
      'pathway.findMany': [{
        id: 'pw1',
        startDate: new Date('2026-03-02'),
        slots: [{ id: 'slot-empty', slotTemplateID: 'st-empty', appointments: [] }],
      }],
    })
    const ctx = new TenantContext()
    const repo = new PathwayRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, () => repo.regenerate('pt1', new Date('2026-03-01')))

    expect(calls[0]).toMatchObject({
      model: 'pathwayTemplate', op: 'findUnique',
      args: { where: { id_serviceId: { id: 'pt1', serviceId: 's1' } } },
    })
    expect(calls[1]).toMatchObject({
      model: 'forbiddenWeek', op: 'findMany',
      args: { where: { serviceId: 's1', establishmentId: 'e1' } },
    })
    expect(calls[2]).toMatchObject({
      model: 'pathway', op: 'findMany',
      args: { where: { serviceId: 's1', templateID: 'pt1', startDate: { gte: expect.any(Date) } } },
    })
    expect(calls[3]).toMatchObject({
      model: 'slot', op: 'deleteMany',
      args: { where: { id: { in: ['slot-empty'] }, serviceId: 's1' } },
    })
    // Condition de surete : seuls les modeles clones (templateID null) sont
    // supprimes, jamais un modele maitre partage par le PathwayTemplate.
    expect(calls[4]).toMatchObject({
      model: 'slotTemplate', op: 'deleteMany',
      args: { where: { id: { in: ['st-empty'] }, templateID: null, serviceId: 's1' } },
    })
    expect(calls[5]).toMatchObject({
      model: 'slotTemplate', op: 'create',
      args: {
        data: {
          serviceId: 's1', establishmentId: 'e1',
          soignantLinks: { create: [{ soignantId: 'so1', serviceId: 's1', establishmentId: 'e1' }] },
        },
      },
    })
    expect(calls[6]).toMatchObject({
      model: 'slot', op: 'create',
      args: { data: { serviceId: 's1', establishmentId: 'e1', pathwayID: 'pw1' } },
    })
  })

  it('PathwayRepository.delete filtre la suppression des slots, modeles clones et du parcours', async () => {
    const { prisma, calls } = buildFakePrisma({
      'pathway.findUniqueOrThrow': {
        id: 'pw1',
        slots: [{ id: 'sl1', slotTemplateID: 'st1' }],
      },
    })
    const ctx = new TenantContext()
    const repo = new PathwayRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, () => repo.delete('pw1'))

    expect(calls[0]).toMatchObject({
      model: 'pathway', op: 'findUniqueOrThrow',
      args: { where: { id_serviceId: { id: 'pw1', serviceId: 's1' } } },
    })
    expect(calls[1]).toMatchObject({
      model: 'slot', op: 'deleteMany',
      args: { where: { id: { in: ['sl1'] }, serviceId: 's1' } },
    })
    // Meme condition de surete que regenerate() : ne jamais supprimer un
    // modele maitre partage par un PathwayTemplate, seulement un clone.
    expect(calls[2]).toMatchObject({
      model: 'slotTemplate', op: 'deleteMany',
      args: { where: { id: { in: ['st1'] }, templateID: null, serviceId: 's1' } },
    })
    expect(calls[3]).toMatchObject({
      model: 'pathway', op: 'delete',
      args: { where: { id_serviceId: { id: 'pw1', serviceId: 's1' } } },
    })
  })
})
