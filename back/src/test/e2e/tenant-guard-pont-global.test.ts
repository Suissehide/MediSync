import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'

// TACHE 15 (etape 4a) — LA CHAINE D'EXPLOITATION, EN VRAI, SUR LA VRAIE BASE.
//
// Le test unitaire (`src/test/unit/infra/tenant-guard.test.ts`, bloc « tache 15 ») epingle le
// VERDICT du garde-fou sur la forme de la requete. Ce fichier-ci epingle autre chose, et c'est
// pour cela qu'il existe en plus : que la chaine soit REELLEMENT exploitable, donc que le refus
// porte sur quelque chose. Les deux pathologies qu'il ferme :
//
//   (a) VRAI PAR CONSTRUCTION — un test ou la requete ne peut de toute facon pas se former, ou
//       qu'une AUTRE garde refuserait deja pour une autre raison (le `where` de la racine, une
//       cle composite). Ici la racine porte son `where: { establishmentId }` LEGITIME, celui du
//       tenant courant, et la chaine ne franchit aucune transition etablissement -> service :
//       avant le correctif, elle passait, et elle ramenait la donnee.
//   (b) VRAI PAR VACUITE — deux etablissements dont un seul est peuple, ou un compte qui n'est
//       membre que d'un seul : la chaine n'aurait alors rien a traverser et le test passerait
//       quoi qu'il arrive. Le scenario ci-dessous cree donc DEUX etablissements REELLEMENT
//       peuples (un patient chacun) et UN compte REELLEMENT membre des deux, et le premier test
//       PROUVE que la chaine est peuplee de bout en bout avant que les suivants ne prouvent
//       qu'elle est refusee.
//
// PIEGE DU DEPOT, verifie ligne par ligne ici : une requete Prisma est PARESSEUSE. Un
// `run(tenant, () => prisma.x.op())` sans `await` A L'INTERIEUR du rappel s'execute hors de la
// portee d'`AsyncLocalStorage`, et le garde-fou lit alors le tenant ambiant (aucun) au lieu de
// celui qu'on croit poser. Chaque rappel ci-dessous attend donc sa requete a l'interieur.

let t: TestApp

// Le decor : A et B, peuples tous les deux, et un compte membre des deux.
type Decor = {
  etablissementA: string
  etablissementB: string
  compte: string
}

const monterLeDecor = async (): Promise<Decor> => {
  await truncateAll()
  const a = await testDb.establishment.create({ data: { name: 'Etab A' } })
  const b = await testDb.establishment.create({ data: { name: 'Etab B' } })
  await testDb.patient.create({
    data: {
      establishmentId: a.id,
      firstName: 'Alice',
      lastName: 'DE-A',
      createDate: new Date('2024-01-01'),
    },
  })
  await testDb.patient.create({
    data: {
      establishmentId: b.id,
      firstName: 'Bruno',
      lastName: 'DE-B',
      createDate: new Date('2024-01-01'),
    },
  })
  const user = await testDb.user.create({
    data: { email: 'membre-des-deux@exemple.test', password: 'h', salt: 's' },
  })
  for (const establishmentId of [a.id, b.id]) {
    await testDb.establishmentMembership.create({
      data: { userId: user.id, establishmentId, role: 'MEMBER' },
    })
  }
  return { etablissementA: a.id, etablissementB: b.id, compte: user.id }
}

const tenantDe = (decor: Decor) => ({
  userId: decor.compte,
  establishmentId: decor.etablissementA,
  establishmentRole: 'MEMBER' as const,
  serviceId: null,
  serviceRole: null,
  soignantId: null,
})

let decor: Decor

beforeAll(async () => {
  t = await buildTestApp()
  decor = await monterLeDecor()
})

afterAll(async () => {
  await t.close()
  await testDb.$disconnect()
})

describe('le pont par un modele global, sous un contexte de tenant ordinaire', () => {
  // La preuve que la chaine d'exploitation EXISTE, avant de prouver qu'elle est fermee. Lue par
  // le client NU (`testDb`, sans l'extension du garde-fou) : c'est la donnee que la chaine
  // gardee ramenait avant le correctif, verifiee ici independamment de lui.
  it('le decor est reellement peuple des deux cotes, et le compte membre des deux', async () => {
    const memberships = await testDb.establishmentMembership.findMany({
      where: { userId: decor.compte },
    })
    expect(memberships.map((m) => m.establishmentId).sort()).toEqual(
      [decor.etablissementA, decor.etablissementB].sort(),
    )
    const patients = await testDb.patient.findMany({ orderBy: { lastName: 'asc' } })
    expect(patients.map((p) => `${p.lastName}@${p.establishmentId}`)).toEqual([
      `DE-A@${decor.etablissementA}`,
      `DE-B@${decor.etablissementB}`,
    ])
  })

  // LECTURE. Avant le correctif, cette requete rendait
  // `[{etab:"Etab A",patient:"Alice DE-A"},{etab:"Etab B",patient:"Bruno DE-B"}]` : « Bruno
  // DE-B », patient de l'etablissement B, traversait jusqu'a un appelant dont le tenant est A.
  it('refuse la chaine du brief, celle qui ramenait le patient de l autre etablissement', async () => {
    const { prisma } = t.instances.postgresOrm
    await expect(
      t.instances.tenantContext.run(tenantDe(decor), async () => {
        // `await` A L'INTERIEUR : sans lui la requete partirait hors du contexte.
        return await prisma.establishmentMembership.findMany({
          where: { establishmentId: decor.etablissementA },
          include: {
            user: {
              include: {
                establishmentMemberships: {
                  include: { establishment: { include: { patients: true } } },
                },
              },
            },
          },
        })
      }),
    ).rejects.toThrow(/relation 'establishmentMemberships'/)
  })

  // ECRITURE, exemple du brief. Avant le correctif, cet appel creait l'etablissement C ET, dans
  // la foulee, un patient « Charlie DE-C » DANS CET ETABLISSEMENT C — depuis un contexte dont le
  // tenant est A.
  it('refuse de creer un etablissement avec un patient imbrique', async () => {
    const { prisma } = t.instances.postgresOrm
    await expect(
      t.instances.tenantContext.run(tenantDe(decor), async () => {
        return await prisma.establishment.create({
          data: {
            name: 'Etab C',
            patients: {
              create: { firstName: 'Charlie', lastName: 'DE-C', createDate: new Date('2024-01-01') },
            },
          },
        })
      }),
    ).rejects.toThrow(/relation 'patients'/)
    expect(await testDb.establishment.findFirst({ where: { name: 'Etab C' } })).toBeNull()
    expect(await testDb.patient.findFirst({ where: { lastName: 'DE-C' } })).toBeNull()
  })

  // ECRITURE, la forme la plus nette : pas un etablissement neuf, mais CELUI D'A COTE. Avant le
  // correctif, l'etablissement B contenait ensuite « Bruno DE-B » ET « Dora DE-D » — un patient
  // ecrit dans un autre etablissement que celui du contexte.
  it('refuse d ecrire un patient dans l etablissement d a cote', async () => {
    const { prisma } = t.instances.postgresOrm
    await expect(
      t.instances.tenantContext.run(tenantDe(decor), async () => {
        return await prisma.establishment.update({
          where: { id: decor.etablissementB },
          data: {
            patients: {
              create: { firstName: 'Dora', lastName: 'DE-D', createDate: new Date('2024-01-01') },
            },
          },
        })
      }),
    ).rejects.toThrow(/relation 'patients'/)
    const patientsDeB = await testDb.patient.findMany({
      where: { establishmentId: decor.etablissementB },
    })
    expect(patientsDeB.map((p) => p.lastName)).toEqual(['DE-B'])
  })

  // L'AUTRE SENS, sur la vraie base : le resserrement ne doit pas avoir ferme la lecture qui
  // traverse un modele global par une relation A-UN. C'est la lecture reelle des membres d'un
  // etablissement (`membership.repository.ts`), et elle doit rendre la donnee, pas seulement ne
  // pas jeter.
  it('laisse passer la lecture reelle des membres, qui ne franchit qu une relation a-un', async () => {
    const { prisma } = t.instances.postgresOrm
    const membres = await t.instances.tenantContext.run(tenantDe(decor), async () => {
      return await prisma.establishmentMembership.findMany({
        where: { establishmentId: decor.etablissementA },
        include: { user: { select: { id: true, email: true } } },
      })
    })
    expect(membres).toHaveLength(1)
    expect(membres[0]?.user.id).toBe(decor.compte)
  })
})
