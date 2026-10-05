import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  adminUrl,
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

// Navigation par echelle (2026-09-28) : le journal d'activite quitte le prefixe de
// service pour l'administration d'etablissement. Il couvre desormais tout l'etablissement
// (perimetre que `docs/multi-tenant/habilitations.md` donne a `activity-log:read`), filtrable par
// service, et reste borne a l'etablissement de l'URL.
describe('journal d activite a l echelle de l etablissement', () => {
  let t: TestApp

  beforeAll(async () => {
    t = await buildTestApp()
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  beforeEach(truncateAll)

  // Deux services A et B dans E, une ligne dans chacun, une ligne sans service ; et une ligne
  // dans un autre etablissement F, qui ne doit jamais sortir.
  const scenario = async () => {
    const E = await createEstablishment('E')
    const F = await createEstablishment('F')
    const A = await createService(E.id, 'A')
    const B = await createService(E.id, 'B')
    const X = await createService(F.id, 'X')
    const admin = await createUser({
      email: 'admin@test.fr',
      memberships: [{ establishmentId: E.id, role: 'ADMIN' }],
    })
    const ligne = (
      establishmentId: string,
      serviceId: string | null,
      entityID: string,
      createdAt?: Date,
    ) =>
      testDb.activityLog.create({
        data: {
          establishmentId,
          serviceId,
          userID: admin.id,
          action: 'thematic.created',
          entityType: 'thematic',
          entityID,
          ...(createdAt ? { createdAt } : {}),
        },
      })
    await ligne(E.id, A.id, 'dans-A')
    await ligne(E.id, B.id, 'dans-B')
    await ligne(E.id, null, 'sans-service')
    await ligne(F.id, X.id, 'autre-etablissement')
    const cookies = await signIn(t.app, 'admin@test.fr')
    return { E, F, A, B, X, cookies, ligne }
  }

  const entites = (body: unknown) =>
    (body as { data: { entityID: string }[] }).data
      .map((l) => l.entityID)
      .sort()

  it('montre tout l etablissement a un administrateur sans service, jamais un autre etablissement', async () => {
    const { E, cookies } = await scenario()

    const res = await t.app.inject({
      method: 'GET',
      url: adminUrl(E.id, '/activity-log'),
      cookies,
    })

    expect(res.statusCode).toBe(200)
    expect(entites(res.json())).toEqual(['dans-A', 'dans-B', 'sans-service'])
  })

  it('resserre au service demande', async () => {
    const { E, A, cookies } = await scenario()

    const res = await t.app.inject({
      method: 'GET',
      url: adminUrl(E.id, `/activity-log?serviceId=${A.id}`),
      cookies,
    })

    expect(res.statusCode).toBe(200)
    expect(entites(res.json())).toEqual(['dans-A'])
  })

  it('ne rend rien pour un service d un autre etablissement passe en filtre', async () => {
    const { E, X, cookies } = await scenario()

    const res = await t.app.inject({
      method: 'GET',
      url: adminUrl(E.id, `/activity-log?serviceId=${X.id}`),
      cookies,
    })

    expect(res.statusCode).toBe(200)
    expect(entites(res.json())).toEqual([])
  })

  it('montre au chef de service son seul service, sans l administration ni les autres services', async () => {
    const { E, A } = await scenario()
    await createUser({
      email: 'coord-a@test.fr',
      memberships: [
        {
          establishmentId: E.id,
          services: [{ serviceId: A.id, role: 'COORDINATEUR' }],
        },
      ],
    })
    const cookies = await signIn(t.app, 'coord-a@test.fr')

    const res = await t.app.inject({
      method: 'GET',
      url: tenantUrl(E.id, A.id, '/activity-log?serviceId=ignore'),
      cookies,
    })

    expect(res.statusCode).toBe(200)
    expect(entites(res.json())).toEqual(['dans-A'])
  })

  it('reste ferme sous le prefixe de service a un intervenant', async () => {
    const { E, A } = await scenario()
    await createUser({
      email: 'interv@test.fr',
      memberships: [
        {
          establishmentId: E.id,
          services: [{ serviceId: A.id, role: 'INTERVENANT' }],
        },
      ],
    })
    const cookies = await signIn(t.app, 'interv@test.fr')

    const res = await t.app.inject({
      method: 'GET',
      url: tenantUrl(E.id, A.id, '/activity-log'),
      cookies,
    })

    expect(res.statusCode).toBe(403)
  })

  it('reste ferme a un coordinateur, qui n administre pas l etablissement', async () => {
    const { E, A } = await scenario()
    await createUser({
      email: 'coord@test.fr',
      memberships: [
        {
          establishmentId: E.id,
          services: [{ serviceId: A.id, role: 'COORDINATEUR' }],
        },
      ],
    })
    const cookies = await signIn(t.app, 'coord@test.fr')

    const res = await t.app.inject({
      method: 'GET',
      url: adminUrl(E.id, '/activity-log'),
      cookies,
    })

    expect(res.statusCode).toBe(404)
  })

  it('purge les lignes anciennes de l etablissement seulement, et du seul service demande', async () => {
    const { E, F, A, B, X, cookies, ligne } = await scenario()
    const ancien = new Date('2000-01-01T00:00:00Z')
    await ligne(E.id, A.id, 'vieux-A', ancien)
    await ligne(E.id, B.id, 'vieux-B', ancien)
    await ligne(F.id, X.id, 'vieux-F', ancien)

    const parService = await t.app.inject({
      method: 'POST',
      url: adminUrl(E.id, `/activity-log/cleanup?serviceId=${A.id}`),
      cookies,
    })
    expect(parService.statusCode).toBe(200)
    expect(parService.json()).toEqual({ deleted: 1 })

    const toutEtablissement = await t.app.inject({
      method: 'POST',
      url: adminUrl(E.id, '/activity-log/cleanup'),
      cookies,
    })
    expect(toutEtablissement.statusCode).toBe(200)
    expect(toutEtablissement.json()).toEqual({ deleted: 1 })

    const restants = await testDb.activityLog.findMany({
      where: { entityID: { startsWith: 'vieux' } },
    })
    expect(restants.map((l) => l.entityID)).toEqual(['vieux-F'])
    expect(F.id).not.toBe(E.id)
  })
})
