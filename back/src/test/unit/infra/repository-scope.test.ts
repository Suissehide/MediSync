import { ActivityLogRepository } from '../../../main/infra/orm/repositories/activityLog.repository'
import { AppointmentRepository } from '../../../main/infra/orm/repositories/appointment.repository'
import { DiagnosticEducatifRepository } from '../../../main/infra/orm/repositories/diagnosticEducatif.repository'
import { DiagnosticEducatifTemplateRepository } from '../../../main/infra/orm/repositories/diagnosticEducatifTemplate.repository'
import { EnrollmentIssueRepository } from '../../../main/infra/orm/repositories/enrollmentIssue.repository'
import { LocationRepository } from '../../../main/infra/orm/repositories/location.repository'
import { MembershipRepository } from '../../../main/infra/orm/repositories/membership.repository'
import { PathwayRepository } from '../../../main/infra/orm/repositories/pathway.repository'
import { PathwayTemplateRepository } from '../../../main/infra/orm/repositories/pathwayTemplate.repository'
import { PatientRepository } from '../../../main/infra/orm/repositories/patient.repository'
import { PatientServiceFileRepository } from '../../../main/infra/orm/repositories/patientServiceFile.repository'
import { PlanningCycleRepository } from '../../../main/infra/orm/repositories/planningCycle.repository'
import { SlotRepository } from '../../../main/infra/orm/repositories/slot.repository'
import { SlotTemplateRepository } from '../../../main/infra/orm/repositories/slotTemplate.repository'
import { SoignantRepository } from '../../../main/infra/orm/repositories/soignant.repository'
import { ThematicRepository } from '../../../main/infra/orm/repositories/thematic.repository'
import { TodoRepository } from '../../../main/infra/orm/repositories/todo.repository'
import { assertTenantScope } from '../../../main/infra/orm/tenant-guard'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { Tenant } from '../../../main/types/utils/tenant-context'
import { TenantContext } from '../../../main/utils/tenant-context'
import { TenantScopeMissingError } from '../../../main/utils/tenant-errors'

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
    expect(calls[0]?.args).toMatchObject({ where: { establishmentId: 'e1' } })
    expect(calls[1]?.args).toMatchObject({ where: { id_establishmentId: { id: 'so1', establishmentId: 'e1' } } })
    expect(calls[2]?.args).toMatchObject({ where: { id_establishmentId: { id: 'l1', establishmentId: 'e1' } } })
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

  // Le service courant PLUS les entrees sans service : les operations de
  // gestion des membres se font dans le contexte d'administration, qui n'a
  // pas de service, et seraient invisibles sinon. On n'ouvre pas pour autant
  // l'activite des autres services.
  const serviceOrNull = { OR: [{ serviceId: 's1' }, { serviceId: null }] }

  it('ActivityLogRepository.findMany filtre par etablissement, service courant ou sans service', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new ActivityLogRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, () => repo.findMany({ page: 1 }))

    expect(calls[0]).toMatchObject({
      model: 'activityLog', op: 'findMany',
      args: { where: { establishmentId: 'e1', ...serviceOrNull } },
    })
    expect(calls[1]).toMatchObject({
      model: 'activityLog', op: 'count',
      args: { where: { establishmentId: 'e1', ...serviceOrNull } },
    })
  })

  it('ActivityLogRepository.deleteOlderThan purge le tenant courant, ou toute la table hors requete', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new ActivityLogRepository(buildContainer(prisma, ctx))
    const date = new Date('2024-01-01')

    await ctx.run(tenant, () => repo.deleteOlderThan(date))
    await ctx.runAsSystem(() => repo.deleteOlderThan(date))

    // Meme perimetre que la lecture : tout ce qui s'affiche est purgeable,
    // et rien d'autre ne l'est.
    expect(calls[0]).toMatchObject({
      model: 'activityLog', op: 'deleteMany',
      args: { where: { establishmentId: 'e1', ...serviceOrNull, createdAt: { lt: date } } },
    })
    expect(calls[1]).toMatchObject({
      model: 'activityLog', op: 'deleteMany',
      args: { where: { createdAt: { lt: date } } },
    })
    expect(calls[1]?.args.where).not.toHaveProperty('establishmentId')
  })
})

describe('MembershipRepository (gestion des membres)', () => {
  it('filtre lecture, comptage et suppression par establishmentId', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new MembershipRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, async () => {
      await repo.findAll()
      await repo.findByID('em1')
      await repo.findByUserID('u9')
      await repo.countAdmins()
      await repo.serviceExists('sv1')
      await repo.delete('em1')
    })

    expect(calls[0]).toMatchObject({
      model: 'establishmentMembership', op: 'findMany',
      args: {
        where: { establishmentId: 'e1' },
        // La relation serviceMemberships porte une cle etrangere simple :
        // elle doit etre filtree explicitement (regle B).
        include: { serviceMemberships: { where: { establishmentId: 'e1' } } },
      },
    })
    expect(calls[1]).toMatchObject({
      model: 'establishmentMembership', op: 'findUniqueOrThrow',
      args: { where: { id_establishmentId: { id: 'em1', establishmentId: 'e1' } } },
    })
    expect(calls[2]).toMatchObject({
      model: 'establishmentMembership', op: 'findFirst',
      args: { where: { userId: 'u9', establishmentId: 'e1' } },
    })
    expect(calls[3]).toMatchObject({
      model: 'establishmentMembership', op: 'count',
      args: { where: { establishmentId: 'e1', role: 'ADMIN', user: { deactivatedAt: null } } },
    })
    expect(calls[4]).toMatchObject({
      model: 'service', op: 'count',
      args: { where: { id: 'sv1', establishmentId: 'e1', deactivatedAt: null } },
    })
    expect(calls[5]).toMatchObject({
      model: 'establishmentMembership', op: 'deleteMany',
      args: { where: { id: 'em1', establishmentId: 'e1' } },
    })
  })

  it('pose establishmentId sur l appartenance et sur chaque affectation creee', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new MembershipRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, () =>
      repo.create({
        userId: 'u9', role: 'MEMBER', soignantId: null,
        services: [{ serviceId: 'sv1', role: 'LECTURE' }],
      }))

    expect(calls[0]).toMatchObject({
      model: 'establishmentMembership', op: 'create',
      args: {
        data: {
          userId: 'u9', establishmentId: 'e1',
          serviceMemberships: {
            create: [{ serviceId: 'sv1', role: 'LECTURE', establishmentId: 'e1' }],
          },
        },
      },
    })
  })

  // Le garde-fou est en refus par defaut : ce test fait passer chaque
  // operation du repository par assertTenantScope, pour qu'une requete que
  // le garde-fou refuserait echoue ici plutot qu'en production.
  it('toutes ses operations passent le garde-fou de tenant', async () => {
    const modelOf: Record<string, string> = {
      establishmentMembership: 'EstablishmentMembership',
      serviceMembership: 'ServiceMembership',
      service: 'Service',
    }
    const ctx = new TenantContext()
    const guarded = (model: string) =>
      new Proxy({}, {
        get: (_t, op: string) => (args: Record<string, unknown>) => {
          assertTenantScope({ model: modelOf[model] ?? model, operation: op, args: args ?? {} }, ctx.peek())
          return Promise.resolve(op === 'findMany' ? [] : op === 'count' ? 0 : { id: 'x' })
        },
      })
    const prisma: Record<string, unknown> = new Proxy({}, {
      get: (_t, model: string) =>
        model === '$transaction'
          ? (fn: (client: unknown) => unknown) => fn(prisma)
          : guarded(model),
    })
    const repo = new MembershipRepository(buildContainer(prisma, ctx))

    // Contexte d'administration d'etablissement : pas de service courant.
    await expect(
      ctx.run({ ...tenant, serviceId: null, serviceRole: null }, async () => {
        await repo.findAll()
        await repo.findByID('em1')
        await repo.findByUserID('u9')
        await repo.countAdmins()
        await repo.serviceExists('sv1')
        await repo.create({ userId: 'u9', role: 'MEMBER', soignantId: null, services: [{ serviceId: 'sv1', role: 'LECTURE' }] })
        await repo.update('em1', { role: 'ADMIN', services: [{ serviceId: 'sv1', role: 'LECTURE' }] })
        await repo.delete('em1')
      }),
    ).resolves.toBeUndefined()
  })

  it('update verifie l appartenance dans le tenant avant de rebattre les affectations', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new MembershipRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, () =>
      repo.update('em1', { role: 'ADMIN', services: [{ serviceId: 'sv1', role: 'LECTURE' }] }))

    // L'identifiant d'appartenance sert de cle etrangere aux ServiceMembership
    // ecrits ensuite : il est d'abord prouve appartenir a l'etablissement.
    expect(calls[0]).toMatchObject({
      model: 'establishmentMembership', op: 'findUniqueOrThrow',
      args: { where: { id_establishmentId: { id: 'em1', establishmentId: 'e1' } } },
    })
    expect(calls[1]).toMatchObject({
      model: 'serviceMembership', op: 'deleteMany',
      args: { where: { establishmentMembershipId: 'em1', establishmentId: 'e1' } },
    })
    expect(calls[2]).toMatchObject({
      model: 'serviceMembership', op: 'createMany',
      args: {
        data: [{
          establishmentMembershipId: 'em1', serviceId: 'sv1',
          role: 'LECTURE', establishmentId: 'e1',
        }],
      },
    })
    expect(calls[3]).toMatchObject({
      model: 'establishmentMembership', op: 'update',
      args: {
        where: { id_establishmentId: { id: 'em1', establishmentId: 'e1' } },
        data: { role: 'ADMIN' },
      },
    })
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

  // `findAll` filtrait bien sur soignantID, mais `findByID`, `update` et
  // `delete` ne filtraient que sur le tenant : n'importe quel membre du
  // service pouvait lire, modifier ou supprimer la tache d'un collegue en
  // connaissant son identifiant — en contradiction avec la permission
  // `todo:own` que le code pretend appliquer.
  it('TodoRepository exige le soignant courant a la lecture unitaire, a la mise a jour et a la suppression', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new TodoRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findByID('td1')
      await repo.update('td1', { completed: true } as never)
      await repo.delete('td1')
    })

    // Lecture unitaire : findFirstOrThrow, le filtre soignantID n'etant pas
    // exprimable dans la cle unique composite id_serviceId.
    expect(calls[0]).toMatchObject({
      model: 'todo', op: 'findFirstOrThrow',
      args: {
        where: { id: 'td1', serviceId: 's1', establishmentId: 'e1', soignantID: 'so1' },
        include: { soignant: true },
      },
    })
    // Ecritures : lecture de garde scopee sur le soignant AVANT l'ecriture.
    expect(calls[1]).toMatchObject({
      model: 'todo', op: 'findFirstOrThrow',
      args: { where: { id: 'td1', serviceId: 's1', soignantID: 'so1' } },
    })
    expect(calls[2]).toMatchObject({ model: 'todo', op: 'update' })
    expect(calls[3]).toMatchObject({
      model: 'todo', op: 'findFirstOrThrow',
      args: { where: { id: 'td1', serviceId: 's1', soignantID: 'so1' } },
    })
    expect(calls[4]).toMatchObject({ model: 'todo', op: 'delete' })
    // Les include des retours actuels sont conserves.
    expect(calls[2]?.args).toMatchObject({ include: { soignant: true } })
  })

  it('TodoRepository garde le filtre sur soignantID null, il ne disparait pas', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new TodoRepository(buildContainer(prisma, ctx))
    await ctx.run({ ...tenant, soignantId: null }, async () => {
      await repo.findAll()
      await repo.findByID('td1')
      await repo.update('td1', { completed: true } as never)
      await repo.delete('td1')
    })
    for (const call of calls.filter((c) => c.op !== 'update' && c.op !== 'delete')) {
      expect(call.args.where).toMatchObject({ soignantID: null })
    }
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

  // EnrollmentIssueRepository est l'autre modele de service deplace par la tache 6 (motifs
  // d'echec d'inscription, rattaches au sous-dossier de service). Jusqu'ici seul
  // DiagnosticEducatifRepository avait un bloc ici : sur cinq sabotages du filtre de service
  // pratiques en revue, les deux qui touchaient EnrollmentIssueRepository (findByPatientID et
  // delete) ne faisaient rougir aucun test — voir tache 6, revue, Critique C1. Ce bloc couvre ses trois
  // methodes, calque sur celui de DiagnosticEducatifRepository ci-dessus.
  it('EnrollmentIssueRepository filtre, cree et supprime avec les cles de tenant', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new EnrollmentIssueRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findByPatientID('p1')
      await repo.create('p1', [{ pathwayTemplateID: 'pt1', reason: 'R', startDate: new Date() }])
      await repo.delete('ei1')
    })
    expect(calls[0]).toMatchObject({
      model: 'enrollmentIssue', op: 'findMany',
      args: { where: { patientId: 'p1', serviceId: 's1', establishmentId: 'e1' } },
    })
    expect(calls[1]).toMatchObject({
      model: 'enrollmentIssue', op: 'createMany',
      args: {
        data: [
          { patientId: 'p1', pathwayTemplateID: 'pt1', reason: 'R', serviceId: 's1', establishmentId: 'e1' },
        ],
      },
    })
    expect(calls[2]).toMatchObject({
      model: 'enrollmentIssue', op: 'delete',
      args: { where: { id_serviceId: { id: 'ei1', serviceId: 's1' } } },
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

  // `Slot.pathwayID` est une reference scalaire simple (la cle etrangere ne
  // porte pas serviceId) : un identifiant de parcours d'un autre service y
  // passerait sans controle. Il n'est plus accepte en entree, ni au typage ni
  // a l'execution — le seul rattachement legitime est le `connect` composite
  // interne a PathwayRepository.
  it('SlotRepository ne transmet jamais pathwayID a Prisma', async () => {
    // Reponses explicites : la relation `slotTemplate` est a un seul
    // enregistrement, le faux client par defaut (tableau vide sur toute cle
    // incluse) ne convient pas a `flattenSlot`.
    const { prisma, calls } = buildFakePrisma({
      'slot.create': { id: 'sl1', slotTemplate: { soignantLinks: [] } },
      'slot.update': { id: 'sl1', slotTemplate: { soignantLinks: [] } },
    })
    const ctx = new TenantContext()
    const repo = new SlotRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.create({
        startDate: new Date(),
        endDate: new Date(),
        slotTemplateID: 'st1',
        pathwayID: 'pw-etranger',
      } as never)
      await repo.update('sl1', { locked: true, pathwayID: 'pw-etranger' } as never)
    })
    expect(calls[0]?.args.data).not.toHaveProperty('pathwayID')
    expect(calls[0]?.args.data).toMatchObject({ serviceId: 's1', establishmentId: 'e1' })
    expect(calls[1]?.args.data).not.toHaveProperty('pathwayID')
    expect(calls[1]?.args.data).toMatchObject({ locked: true })
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
    const soignantLinksWrite = (calls[0]?.args.data as { soignantLinks: object }).soignantLinks
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

describe('scoping appointment', () => {
  it('cree le rendez-vous et ses patients avec les colonnes de tenant', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new AppointmentRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.create({ startDate: new Date(), endDate: new Date(), slotID: 'sl', patientIDs: ['p1'] } as never)
      await repo.addPatientToAppointment({ appointmentID: 'a1', patientID: 'p2' } as never)
      await repo.deleteOrphanedByIds(['a1'])
    })
    // `create` n'ecrit plus `appointmentPatients` en creation imbriquee : `serviceId` fait
    // partie de la cle etrangere composite de la relation `appointment`
    // ([appointmentId, serviceId]), donc Prisma le refuse dans cette forme
    // ("Unknown argument `serviceId`") — voir le commentaire de
    // `AppointmentRepository.create` (task-5-re-review.md, point 3). Le rendez-vous et ses
    // participants sont donc deux ecritures de premier niveau, dans la transaction.
    expect(calls[0]).toMatchObject({
      model: 'appointment', op: 'create',
      args: { data: { serviceId: 's1', establishmentId: 'e1', slotID: 'sl' } },
    })
    expect(calls[0]?.args.data).not.toHaveProperty('appointmentPatients')
    expect(calls[1]).toMatchObject({
      model: 'appointmentPatient', op: 'createMany',
      args: { data: [{ appointmentId: 'x', patientId: 'p1', serviceId: 's1', establishmentId: 'e1' }] },
    })
    expect(calls[2]).toMatchObject({
      model: 'appointment', op: 'findUniqueOrThrow',
      args: { where: { id_serviceId: { id: 'x', serviceId: 's1' } } },
    })
    expect(calls[3]).toMatchObject({
      model: 'appointmentPatient', op: 'create',
      args: { data: { appointmentId: 'a1', patientId: 'p2', serviceId: 's1', establishmentId: 'e1' } },
    })
    expect(calls[4]).toMatchObject({
      model: 'appointment', op: 'deleteMany',
      args: { where: { id: { in: ['a1'] }, serviceId: 's1', appointmentPatients: { none: {} } } },
    })
  })

  it('update supprime le rendez-vous quand la liste de patients est vide', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new AppointmentRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, () => repo.update('a1', { motif: 'x', appointmentPatients: [] } as never))

    // Une seule operation : la suppression, filtree par la cle composite.
    // Ni mise a jour du rendez-vous ni ecriture sur les participants.
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      model: 'appointment', op: 'delete',
      args: { where: { id_serviceId: { id: 'a1', serviceId: 's1' } } },
    })
  })

  it('update ne touche pas aux participants quand la liste est absente', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new AppointmentRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, () => repo.update('a1', { motif: 'y' } as never))

    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({
      model: 'appointment', op: 'update',
      args: { where: { id_serviceId: { id: 'a1', serviceId: 's1' } }, data: { motif: 'y' } },
    })
    expect(calls[1]).toMatchObject({
      model: 'appointment', op: 'findUniqueOrThrow',
      args: { where: { id_serviceId: { id: 'a1', serviceId: 's1' } } },
    })
  })

  it('update retire les patients disparus puis insere ou met a jour les autres avec la cle composite', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new AppointmentRepository(buildContainer(prisma, ctx))

    await ctx.run(tenant, () =>
      repo.update('a1', {
        appointmentPatients: [{ id: 'ap1', patientID: 'p1', accompanying: null, status: null, rejectionReason: null, transmissionNotes: null }],
      } as never),
    )

    expect(calls).toHaveLength(4)
    expect(calls[0]).toMatchObject({
      model: 'appointment', op: 'update',
      args: { where: { id_serviceId: { id: 'a1', serviceId: 's1' } } },
    })
    expect(calls[1]).toMatchObject({
      model: 'appointmentPatient', op: 'deleteMany',
      args: { where: { appointmentId: 'a1', serviceId: 's1', id: { notIn: ['ap1'] } } },
    })
    expect(calls[2]).toMatchObject({
      model: 'appointmentPatient', op: 'upsert',
      args: {
        where: { id_serviceId: { id: 'ap1', serviceId: 's1' } },
        create: {
          serviceId: 's1', establishmentId: 'e1',
          appointmentId: 'a1', patientId: 'p1',
        },
      },
    })
    expect(calls[3]).toMatchObject({
      model: 'appointment', op: 'findUniqueOrThrow',
      args: { where: { id_serviceId: { id: 'a1', serviceId: 's1' } } },
    })
  })
})

// Etape 3 du multi-tenant, tache 7 : `estSuiviAilleurs` est LA SEULE lecture de tout le back qui
// traverse volontairement la frontiere entre services (design §5.3). Ce bloc en verifie le
// mecanisme, pas seulement le resultat : la forme exacte de la requete (ses deux bornes, memes
// sous `runAsSystem`), et — a la place ou l'aurait laissee un simple test de retour — la preuve
// que cette forme precise serait refusee par le garde-fou d'ORM sans le mode encadre. Voir aussi
// back/src/test/unit/infra/runAsSystem-unicite.test.ts (unicite de l'exception dans les sources)
// et back/src/test/e2e/dossier-service.test.ts (comportement de bout en bout, cloisonnement).
describe('PatientServiceFileRepository.estSuiviAilleurs', () => {
  it('interroge sous runAsSystem, avec l etablissement courant et un service different du courant', async () => {
    const { prisma, calls } = buildFakePrisma({ 'patientServiceFile.findFirst': { patientId: 'p1' } })
    const ctx = new TenantContext()
    const spy = jest.spyOn(ctx, 'runAsSystem')
    const repo = new PatientServiceFileRepository(buildContainer(prisma, ctx))

    const resultat = await ctx.run(tenant, () => repo.estSuiviAilleurs('p1'))

    expect(spy).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      model: 'patientServiceFile', op: 'findFirst',
      args: {
        where: { patientId: 'p1', establishmentId: 'e1', serviceId: { not: 's1' } },
        select: { patientId: true },
      },
    })
    // Rien d'autre qu'un booleen ne sort de la fonction : la ligne trouvee
    // (`{ patientId: 'p1' }`) n'est jamais retournee telle quelle.
    expect(resultat).toBe(true)
  })

  it('rend vrai quand un autre sous-dossier existe, faux sinon', async () => {
    const ctx = new TenantContext()

    const { prisma: prismaAvecAutre } = buildFakePrisma({ 'patientServiceFile.findFirst': { patientId: 'p1' } })
    const repoAvecAutre = new PatientServiceFileRepository(buildContainer(prismaAvecAutre, ctx))
    await expect(ctx.run(tenant, () => repoAvecAutre.estSuiviAilleurs('p1'))).resolves.toBe(true)

    const { prisma: prismaSansAutre } = buildFakePrisma({ 'patientServiceFile.findFirst': null })
    const repoSansAutre = new PatientServiceFileRepository(buildContainer(prismaSansAutre, ctx))
    await expect(ctx.run(tenant, () => repoSansAutre.estSuiviAilleurs('p1'))).resolves.toBe(false)
  })

  // Le mecanisme, isole : la forme EXACTE de requete que la fonction construit
  // (patientId + establissement courant + serviceId EXCLU du courant) est celle qu'un
  // `runAsSystem` retire de la portee du garde-fou. Sans lui (store `kind: 'tenant'`), le
  // garde-fou refuse — c'est ce refus qui rend `runAsSystem` necessaire, pas une preference de
  // style. Avec lui (store `kind: 'system'`), il laisse passer : c'est exactement ce que fait
  // tenant-guard.ts (`if (store.kind === 'system') { return }`, voir infra/orm/tenant-guard.ts).
  it('la forme de requete qu elle construit est refusee par le garde-fou hors du mode encadre, et permise dedans', () => {
    const args = {
      where: { patientId: 'p1', establishmentId: 'e1', serviceId: { not: 's1' } },
      select: { patientId: true },
    }
    expect(() =>
      assertTenantScope(
        { model: 'PatientServiceFile', operation: 'findFirst', args },
        { kind: 'tenant', tenant },
      ),
    ).toThrow(TenantScopeMissingError)

    expect(() =>
      assertTenantScope(
        { model: 'PatientServiceFile', operation: 'findFirst', args },
        { kind: 'system' },
      ),
    ).not.toThrow()
  })
})

// Design §3.6, tache 9 : le second et dernier appel de l'exception (voir runAsSystem-unicite.
// test.ts). Appele depuis l'administration d'etablissement — AUCUN service dans le tenant
// courant (`serviceId: null`) — ce bloc verifie que la methode fonctionne quand meme (elle ne
// lit jamais `this.scope`, qui exigerait un service), la forme exacte des DEUX requetes qu'elle
// construit, et le compte qui importe : les patients suivis ICI mais NULLE PART AILLEURS dans le
// meme etablissement.
describe('PatientServiceFileRepository.impactDesactivation', () => {
  const tenantAdminEtablissement: Tenant = {
    userId: 'u1', establishmentId: 'e1', establishmentRole: 'ADMIN',
    serviceId: null, serviceRole: null, soignantId: null,
  }

  it('interroge sous runAsSystem, sans service courant, et rend les patients suivis ici mais nulle part ailleurs', async () => {
    const calls: { model: string; op: string; args: Record<string, unknown> }[] = []
    // Deux patients (p1, p2) suivis ici (serviceId 'sB') ET ailleurs dans l'etablissement ; un
    // troisieme (p3) suivi ici SEULEMENT — c'est lui, et lui seul, qui doit compter dans
    // `suivisNullePartAilleurs`. Un jeu ou les deux comptes coincideraient (tous suivis
    // ailleurs, ou aucun) ne prouverait rien : celui-ci les distingue.
    const reponses = [
      [{ patientId: 'p1' }, { patientId: 'p2' }, { patientId: 'p3' }],
      [{ patientId: 'p1' }, { patientId: 'p2' }],
    ]
    let appel = 0
    const prisma = {
      patientServiceFile: {
        findMany: (args: Record<string, unknown>) => {
          calls.push({ model: 'patientServiceFile', op: 'findMany', args })
          return Promise.resolve(reponses[appel++])
        },
      },
    }
    const ctx = new TenantContext()
    const spy = jest.spyOn(ctx, 'runAsSystem')
    const repo = new PatientServiceFileRepository(buildContainer(prisma, ctx))

    const resultat = await ctx.run(tenantAdminEtablissement, () =>
      repo.impactDesactivation('sB', 'e1'),
    )

    expect(spy).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
    // Premiere requete : les sous-dossiers du service dont on evalue la desactivation.
    expect(calls[0]).toMatchObject({
      model: 'patientServiceFile', op: 'findMany',
      args: {
        where: { serviceId: 'sB', establishmentId: 'e1' },
        select: { patientId: true },
      },
    })
    // Seconde requete : parmi CES MEMES patients, ceux suivis dans un AUTRE service ACTIF du
    // MEME etablissement — jamais un autre etablissement (impossible de toute facon par la cle
    // etrangere composite, mais la requete porte quand meme sa propre borne, comme
    // `estSuiviAilleurs`). `service: { deactivatedAt: null }` (tour de correction 1, relecture,
    // Important n°1) : un service DEJA desactive ne protege plus personne de l'invisibilite,
    // donc il ne doit pas compter comme un « ailleurs » qui sauve le patient du compte qui
    // importe.
    expect(calls[1]).toMatchObject({
      model: 'patientServiceFile', op: 'findMany',
      args: {
        where: {
          establishmentId: 'e1',
          patientId: { in: ['p1', 'p2', 'p3'] },
          serviceId: { not: 'sB' },
          service: { deactivatedAt: null },
        },
        select: { patientId: true },
      },
    })
    // Rien d'autre que deux nombres ne sort de la fonction.
    expect(resultat).toEqual({ suivisIci: 3, suivisNullePartAilleurs: 1 })
  })

  it('ne fait pas la seconde requete quand personne n est suivi ici : { 0, 0 } directement', async () => {
    const calls: unknown[] = []
    const prisma = {
      patientServiceFile: {
        findMany: (args: unknown) => {
          calls.push(args)
          return Promise.resolve([])
        },
      },
    }
    const ctx = new TenantContext()
    const repo = new PatientServiceFileRepository(buildContainer(prisma, ctx))

    const resultat = await ctx.run(tenantAdminEtablissement, () =>
      repo.impactDesactivation('sVide', 'e1'),
    )

    expect(calls).toHaveLength(1)
    expect(resultat).toEqual({ suivisIci: 0, suivisNullePartAilleurs: 0 })
  })

  // Meme demonstration que pour estSuiviAilleurs : la forme de la SECONDE requete (celle qui
  // traverse la frontiere entre services) est refusee par le garde-fou hors du mode encadre.
  it('la forme de la requete qui traverse la frontiere est refusee hors du mode encadre, et permise dedans', () => {
    const args = {
      where: {
        establishmentId: 'e1',
        patientId: { in: ['p1'] },
        serviceId: { not: 'sB' },
        service: { deactivatedAt: null },
      },
      select: { patientId: true },
    }
    expect(() =>
      assertTenantScope(
        { model: 'PatientServiceFile', operation: 'findMany', args },
        { kind: 'tenant', tenant: tenantAdminEtablissement },
      ),
    ).toThrow(TenantScopeMissingError)

    expect(() =>
      assertTenantScope(
        { model: 'PatientServiceFile', operation: 'findMany', args },
        { kind: 'system' },
      ),
    ).not.toThrow()
  })
})
