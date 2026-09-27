import { PatientAccessLogDomain } from '../../../main/domain/patientAccessLog.domain'
import { PatientAccessLogRepository } from '../../../main/infra/orm/repositories/patientAccessLog.repository'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { Tenant } from '../../../main/types/utils/tenant-context'
import { buildPatientExportFilters } from '../../../main/utils/access-log-routes'
import { CLINICAL_FIELDS } from '../../../main/utils/clinical-fields'
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

// TOUR DE CORRECTION 1 (revue) — le VRAI depot, jamais un mock, monte contre un VRAI
// `TenantContext` : c'est le chemin de production. La revue a demontre par execution qu'un
// domaine construit sans `tenantContext` (comme le prescrivait litteralement le brief) masquait
// un trou reel dans la garde clinique — voir le commentaire de `record` dans
// patientAccessLog.domain.ts. Toute assertion sur la garde clinique passe desormais par ce
// montage, jamais par un mock du depot qui ne prouverait que l'appel, pas l'ecriture reelle.
const setup = () => {
  const { prisma, calls } = buildFakePrisma()
  const ctx = new TenantContext()
  const repository = new PatientAccessLogRepository(buildContainer(prisma, ctx))
  const domain = new PatientAccessLogDomain({
    patientAccessLogRepository: repository,
    tenantContext: ctx,
  } as never)
  return { ctx, repository, domain, calls }
}

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

// TOUR DE CORRECTION 1 (revue, critique n°2) — un `Tenant` qui n'a PAS ete resolu par
// `resolveTenantFromUser` (donc sans la cle `origine` du tout, pas juste `undefined` explicite) :
// c'est la forme reelle que prend la grande majorite des fixtures `Tenant` de ce depot. Sans
// cette fixture, `origine === 'octroi'` et `origine !== 'reelle'` rendent EXACTEMENT le meme
// verdict sur les deux fixtures ci-dessus (elles portent toutes les deux `origine` explicitement)
// et rien ne distingue les deux ecritures.
const tenantSansOrigine: Tenant = {
  userId: 'u2', establishmentId: 'e1', establishmentRole: 'MEMBER',
  serviceId: 's1', serviceRole: 'INTERVENANT', soignantId: 'so2',
}

const validInput = {
  patientId: 'p1',
  userID: 'u1',
  userFirstName: 'Ada',
  userLastName: 'Lovelace',
  action: 'dossier.ouvert' as const,
}

describe('PatientAccessLogDomain.record', () => {
  // TOUR DE CORRECTION 1 (revue, critique n°1) — remplace l'ancienne version (domaine construit
  // sans `tenantContext`) qui rougissait sous sabotage, mais pour la mauvaise raison (un
  // `TypeError` de construction, pas le rejet clinique attendu) : voir le commentaire de `record`.
  // Monte ici sur le VRAI depot, avec un VRAI `tenantContext` entre par `ctx.run` — le chemin de
  // production. Sabotage etroit verifie par execution (retirer `'notes'` de la liste importee
  // dans le domaine) : le test rougit alors PARCE QUE `repository.create` EST appele et que
  // `calls` porte `"notes":"texte clinique"` intact — la bonne raison, celle que la revue
  // demandait de prouver.
  it("refuse d'ecrire une ligne dont les filtres portent une cle clinique, sur le chemin reel", async () => {
    const { ctx, domain, calls } = setup()

    await expect(
      ctx.run(tenantReel, () =>
        domain.record({
          patientId: 'p1',
          userID: 'u1',
          userFirstName: null,
          userLastName: null,
          action: 'export',
          exportFilters: JSON.stringify({ search: 'dupont', notes: 'texte clinique' }),
        }),
      ),
    ).rejects.toThrow(/clinique/i)

    expect(calls).toHaveLength(0)
  })

  // TOUR DE CORRECTION 1 (revue) — la garde ne regardait que le premier niveau des cles ; un
  // filtre exotique nichant la cle clinique sous un objet ou un tableau passait sans etre vu.
  // Sabotage etroit : remplacer la recursion de `findClinicalKey` par une simple boucle sur les
  // cles de premier niveau fait rougir CE test precisement (et lui seul parmi les tests
  // "clinique" de ce fichier, puisque les autres portent leur cle clinique au premier niveau).
  it("refuse une cle clinique nichee sous un objet ou un tableau, pas seulement au premier niveau", async () => {
    const { ctx, domain, calls } = setup()

    await expect(
      ctx.run(tenantReel, () =>
        domain.record({
          ...validInput,
          action: 'export',
          exportFilters: JSON.stringify({
            criteres: [{ champ: 'age' }, { medicalDiagnosis: 'texte clinique' }],
          }),
        }),
      ),
    ).rejects.toThrow(/clinique/i)

    expect(calls).toHaveLength(0)
  })

  // TOUR DE CORRECTION 1 (revue) — une chaine non analysable comme JSON etait silencieusement
  // ACCEPTEE (l'ancien `catch` faisait un simple `return`). La seule barriere du journal
  // acceptait alors tout ce qu'elle ne savait pas lire. Sabotage etroit : remettre ce `return`
  // dans le `catch` fait rougir CE test precisement.
  it("refuse un exportFilters qui n'est pas un JSON analysable, plutot que de l'accepter silencieusement", async () => {
    const { ctx, domain, calls } = setup()

    await expect(
      ctx.run(tenantReel, () =>
        domain.record({
          ...validInput,
          action: 'export',
          exportFilters: 'texte libre, pas du JSON {',
        }),
      ),
    ).rejects.toThrow(/clinique|analysable/i)

    expect(calls).toHaveLength(0)
  })

  it("ecrit la ligne quand exportFilters ne porte aucune cle clinique, a aucune profondeur", async () => {
    const { ctx, domain, calls } = setup()

    await ctx.run(tenantReel, () =>
      domain.record({
        ...validInput,
        action: 'export',
        exportFilters: JSON.stringify({ search: 'dupont', criteres: [{ champ: 'age' }] }),
      }),
    )

    expect(calls).toHaveLength(1)
  })

  // Preuve que le depot (et non un mock) pose bien establishmentId/serviceId depuis
  // `tenantContext.scope()`, jamais depuis l'appelant (consigne 1 du brief) — et que le domaine
  // calcule correctement `accesParOctroi` a partir de `tenantContext.current().origine` (decision
  // du 2026-09-27). Les fixtures (`tenantReel`, `tenantOctroi`) portent le MEME couple
  // etablissement/service : sans elles, un test qui ne comparerait qu'un des deux cas ne
  // prouverait rien sur la colonne elle-meme.
  it('pose establishmentId/serviceId depuis le scope, et accesParOctroi a faux pour un acces reel', async () => {
    const { ctx, domain, calls } = setup()

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
    const { ctx, domain, calls } = setup()

    await ctx.run(tenantOctroi, () => domain.record(validInput))

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      establishmentId: 'e1',
      serviceId: 's1',
      accesParOctroi: true,
    })
  })

  // TOUR DE CORRECTION 1 (revue, critique n°2) — sans cette fixture, `origine === 'octroi'` et
  // `origine !== 'reelle'` rendent le meme verdict sur `tenantReel`/`tenantOctroi` (les deux
  // portent `origine` explicitement) : rien ne distinguait les deux formes. Sabotage independant
  // verifie par execution : remplacer `origine === 'octroi'` par `origine !== 'reelle'` dans le
  // domaine fait rougir CE test precisement (`accesParOctroi` deviendrait `true` au lieu de
  // `false`), sans faire rougir aucun des deux tests precedents.
  it("pose accesParOctroi a faux quand origine est absente du tenant (defaut sur, jamais un octroi affirme a tort)", async () => {
    const { ctx, domain, calls } = setup()

    await ctx.run(tenantSansOrigine, () => domain.record(validInput))

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ accesParOctroi: false })
  })

  // Consigne 4 du brief : le garde-fou echoue ferme. Ici, c'est `tenantContext.current()` (lu par
  // le domaine pour `origine`, avant meme d'atteindre le depot) qui refuse hors de tout contexte
  // de tenant — montre par execution, avec un `TenantContext` reel, plutot que suppose.
  it("refuse d'ecrire hors de tout contexte de tenant", async () => {
    const { domain, calls } = setup()

    await expect(domain.record(validInput)).rejects.toThrow(TenantContextMissingError)
    expect(calls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// L'export (tache 4) : les criteres journalises viennent de `buildPatientExportFilters`
// (utils/access-log-routes.ts), jamais recopies ici -- composition avec la garde clinique
// ci-dessus (tache 2), sur le chemin reel, plutot qu'une seconde garde a cote.
// ---------------------------------------------------------------------------

describe("PatientAccessLogDomain.record, les criteres de l export (tache 4)", () => {
  it('ecrit la ligne, sans identifiant de patient, quand les criteres construits depuis la requete (search, pathwayTemplateTags) sont legitimes', async () => {
    const { ctx, domain, calls } = setup()

    await ctx.run(tenantReel, () =>
      domain.record({
        userID: 'u1',
        userFirstName: null,
        userLastName: null,
        action: 'export',
        exportCount: 2,
        exportFilters: buildPatientExportFilters({
          search: 'dup',
          pathwayTemplateTags: ['asthme'],
        }),
      }),
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]).not.toHaveProperty('patientId')
    expect(calls[0]).toMatchObject({
      action: 'export',
      exportCount: 2,
      exportFilters: JSON.stringify({ search: 'dup', pathwayTemplateTags: ['asthme'] }),
    })
  })

  // Aucune des deux clefs que `buildPatientExportFilters` connait (`search`,
  // `pathwayTemplateTags`) n'est clinique : la chaine de requete reelle de `/patient/export` ne
  // peut donc pas y glisser une cle interdite aujourd'hui. Cette garde reste la SEULE barriere
  // si une future route d'export venait a accepter un critere en texte libre nomme d'apres une
  // colonne clinique -- eprouvee ici avec une cle IMPORTEE (`CLINICAL_FIELDS`,
  // utils/clinical-fields.ts), jamais recopiee, pour ne jamais diverger de la liste que la
  // garde consulte reellement.
  it('refuse meme un export dont les criteres porteraient une cle clinique importee', async () => {
    const { ctx, domain, calls } = setup()
    const [cleClinique] = CLINICAL_FIELDS
    expect(cleClinique).toBeDefined()

    await expect(
      ctx.run(tenantReel, () =>
        domain.record({
          userID: 'u1',
          userFirstName: null,
          userLastName: null,
          action: 'export',
          exportCount: 2,
          exportFilters: JSON.stringify({
            search: 'dup',
            [cleClinique as string]: 'texte clinique',
          }),
        }),
      ),
    ).rejects.toThrow(/clinique/i)

    expect(calls).toHaveLength(0)
  })
})
