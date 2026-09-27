import { PatientAccessLogDomain } from '../../../main/domain/patientAccessLog.domain'
import { PatientAccessLogRepository } from '../../../main/infra/orm/repositories/patientAccessLog.repository'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { Tenant } from '../../../main/types/utils/tenant-context'
import { TenantContext } from '../../../main/utils/tenant-context'
import { TenantContextMissingError } from '../../../main/utils/tenant-errors'

// Faux client Prisma minimal, dans le style de `buildFakePrisma`
// (src/test/unit/infra/repository-scope.test.ts) mais reduit a `patientAccessLog.create` : c'est
// le seul modele et la seule operation dont ce fichier a besoin.
const buildFakePrisma = () => {
  const calls: Record<string, unknown>[] = []
  return {
    prisma: {
      patientAccessLog: {
        create: (args: { data: Record<string, unknown> }) => {
          calls.push(args.data)
          return Promise.resolve({ id: 'log1', ...args.data })
        },
      },
    },
    calls,
  }
}

const buildContainer = (prisma: unknown, tenantContext: TenantContext) =>
  ({
    postgresOrm: { prisma },
    tenantContext,
    errorHandler: { boomErrorFromPrismaError: ({ error }: { error: unknown }) => error },
  }) as unknown as IocContainer

// Un membre reel d'un service — le chemin de tenant ordinaire pour un acces de soin.
const tenantReel: Tenant = {
  userId: 'u1', establishmentId: 'e1', establishmentRole: 'MEMBER',
  serviceId: 's1', serviceRole: 'INTERVENANT', soignantId: 'so1',
  origine: 'reelle',
}

// Le MEME couple etablissement/service, mais atteint par un octroi temporaire vivant
// (`SuperAdminAccessGrant`) : memes appartenances effectives qu'un membre reel
// (`effectiveMemberships`, domain/accessGrant.domain.ts — ADMIN/COORDINATEUR, voir
// `commeOctroi`), seule `origine` les distingue. C'est exactement le cas que la decision du
// 2026-09-27 (etape 4b) demande de ne pas laisser indiscernable dans le journal.
const tenantOctroi: Tenant = {
  ...tenantReel,
  userId: 'u9', establishmentRole: 'ADMIN', serviceRole: 'COORDINATEUR', soignantId: null,
  origine: 'octroi',
}

const validInput = {
  patientId: 'p1',
  userID: 'u1',
  userFirstName: 'Ada',
  userLastName: 'Lovelace',
  action: 'dossier.ouvert' as const,
}

describe('PatientAccessLogDomain.record', () => {
  it("refuse d'ecrire une ligne dont les filtres portent une cle clinique", async () => {
    const repository = { create: jest.fn() }
    const domain = new PatientAccessLogDomain({ patientAccessLogRepository: repository } as never)

    await expect(
      domain.record({
        patientId: 'p1',
        userID: 'u1',
        userFirstName: null,
        userLastName: null,
        action: 'export',
        exportFilters: JSON.stringify({ search: 'dupont', notes: 'texte clinique' }),
      }),
    ).rejects.toThrow(/clinique/i)

    expect(repository.create).not.toHaveBeenCalled()
  })

  it("ecrit la ligne quand exportFilters ne porte aucune cle clinique", async () => {
    const repository = { create: jest.fn().mockResolvedValue({ id: 'log1' }) }
    const ctx = new TenantContext()
    const domain = new PatientAccessLogDomain({ patientAccessLogRepository: repository, tenantContext: ctx } as never)

    await ctx.run(tenantReel, () =>
      domain.record({
        ...validInput,
        action: 'export',
        exportFilters: JSON.stringify({ search: 'dupont' }),
      }),
    )

    expect(repository.create).toHaveBeenCalledTimes(1)
  })

  // Preuve que le depot (et non un mock) pose bien establishmentId/serviceId depuis
  // `tenantContext.scope()`, jamais depuis l'appelant (consigne 1 du brief) — et que le domaine
  // calcule correctement `accesParOctroi` a partir de `tenantContext.current().origine` (decision
  // du 2026-09-27). Les deux fixtures (`tenantReel`, `tenantOctroi`) portent le MEME couple
  // etablissement/service : sans elles, un test qui ne comparerait qu'un des deux cas ne
  // prouverait rien sur la colonne elle-meme.
  it('pose establishmentId/serviceId depuis le scope, et accesParOctroi a faux pour un acces reel', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repository = new PatientAccessLogRepository(buildContainer(prisma, ctx))
    const domain = new PatientAccessLogDomain({ patientAccessLogRepository: repository, tenantContext: ctx } as never)

    await ctx.run(tenantReel, () => domain.record(validInput))

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      establishmentId: 'e1',
      serviceId: 's1',
      patientId: 'p1',
      userID: 'u1',
      action: 'dossier.ouvert',
      accesParOctroi: false,
    })
  })

  it('pose accesParOctroi a vrai pour le meme acces obtenu par octroi temporaire', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repository = new PatientAccessLogRepository(buildContainer(prisma, ctx))
    const domain = new PatientAccessLogDomain({ patientAccessLogRepository: repository, tenantContext: ctx } as never)

    await ctx.run(tenantOctroi, () => domain.record(validInput))

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      establishmentId: 'e1',
      serviceId: 's1',
      accesParOctroi: true,
    })
  })

  // Consigne 4 du brief : le garde-fou echoue ferme. Ici, c'est `tenantContext.current()` (lu par
  // le domaine pour `origine`, avant meme d'atteindre le depot) qui refuse hors de tout contexte
  // de tenant — montre par execution, avec un `TenantContext` reel, plutot que suppose.
  it("refuse d'ecrire hors de tout contexte de tenant", async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repository = new PatientAccessLogRepository(buildContainer(prisma, ctx))
    const domain = new PatientAccessLogDomain({ patientAccessLogRepository: repository, tenantContext: ctx } as never)

    await expect(domain.record(validInput)).rejects.toThrow(TenantContextMissingError)
    expect(calls).toHaveLength(0)
  })
})
