import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

// MDS-17 : LE COORDINATEUR GERE L'EQUIPE DE SON SERVICE — il invite, change le role de service et
// retire, sous `service-members:manage`. Trois proprietes sont eprouvees ici, et elles ne se
// recouvrent pas :
//
//   1. LE PERIMETRE. Ce qu'il touche s'arrete a SON service : le rattachement d'etablissement
//      n'est jamais cree en `ADMIN`, jamais retire, et l'affectation d'un AUTRE service survit a
//      un retrait d'ici. Un coordinateur d'un service ne voit ni ne modifie l'equipe de l'autre.
//   2. LES GARDES DE JETON SONT BIEN CELLES DE `createAccountCore`, pas des copies. Inviter emet
//      un lien de premiere connexion, qui reinitialise le mot de passe d'un `User` GLOBAL : les
//      deux refus de `assertIssuableToken` (compte super-admin, compte rattache ailleurs) doivent
//      donc mordre depuis CETTE route aussi. C'est la raison d'etre du partage du coeur, et si un
//      jour quelqu'un recopiait les gardes au lieu de les appeler, ce sont ces deux cas qui le
//      diraient.
//   3. CE QUE LA REPONSE REND. `accessLink` seul, jamais l'identite du compte — le nom STOCKE et
//      le cuid seraient des oracles d'existence sur une adresse qui a deja un compte. `null` dit
//      « ce compte etait deja rattache ici », le seul fait dont l'appelant a besoin.
//
// Un seul scenario, monte une fois (la connexion est limitee en debit par instance
// d'application), et chaque cas ne lit que ce qu'il doit eprouver.
describe('l equipe d un service, geree par son coordinateur', () => {
  let t: TestApp
  let E: string
  let E2: string
  let A: string
  let B: string
  let coordA: { access_token: string }
  let interA: { access_token: string }

  const call = (
    cookies: { access_token: string },
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) => t.app.inject({ method, url, cookies, ...(payload ? { payload } : {}) })

  const membres = (cookies: { access_token: string }, service = A) =>
    call(cookies, 'GET', tenantUrl(E, service, '/membres'))

  const inviter = (payload: object) =>
    call(coordA, 'POST', tenantUrl(E, A, '/membres'), payload)

  const affectation = (email: string, serviceId: string) =>
    testDb.serviceMembership.findFirstOrThrow({
      where: {
        serviceId,
        establishmentMembership: { user: { email } },
      },
    })

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    E = (await createEstablishment('CHU Haut-Leveque')).id
    E2 = (await createEstablishment('CH Libourne')).id
    A = (await createService(E, 'Cardiologie')).id
    B = (await createService(E, 'Pneumologie')).id
    await createUser({
      email: 'coord-a@test.fr',
      memberships: [
        {
          establishmentId: E,
          services: [{ serviceId: A, role: 'COORDINATEUR' }],
        },
      ],
    })
    await createUser({
      email: 'inter-a@test.fr',
      memberships: [
        {
          establishmentId: E,
          services: [{ serviceId: A, role: 'INTERVENANT' }],
        },
      ],
    })
    // Deja rattache a l'etablissement, affecte au SEUL service B : la branche « aucun jeton » de
    // l'invitation, et le temoin du perimetre au moment du retrait.
    await createUser({
      email: 'polyvalent@test.fr',
      memberships: [
        {
          establishmentId: E,
          services: [{ serviceId: B, role: 'INTERVENANT' }],
        },
      ],
    })
    await createUser({ email: 'super@test.fr', isSuperAdmin: true })
    await createUser({
      email: 'ailleurs@test.fr',
      memberships: [{ establishmentId: E2 }],
    })
    coordA = await signIn(t.app, 'coord-a@test.fr')
    interA = await signIn(t.app, 'inter-a@test.fr')
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  it('refuse les trois ecritures a un intervenant, qui garde la lecture', async () => {
    const cible = await affectation('coord-a@test.fr', A)
    const refus = await Promise.all([
      call(interA, 'POST', tenantUrl(E, A, '/membres'), {
        email: 'quelquun@test.fr',
        role: 'LECTURE',
      }),
      call(interA, 'PATCH', tenantUrl(E, A, `/membres/${cible.id}`), {
        role: 'LECTURE',
      }),
      call(interA, 'DELETE', tenantUrl(E, A, `/membres/${cible.id}`)),
    ])
    expect(refus.map((r) => r.statusCode)).toEqual([403, 403, 403])
    expect((await membres(interA)).statusCode).toBe(200)
  })

  it('invite une adresse inconnue : un lien, un rattachement MEMBER, le seul service courant', async () => {
    const res = await inviter({
      email: 'neuve@test.fr',
      firstName: 'Camille',
      lastName: 'Roux',
      role: 'SECRETARIAT',
    })
    expect(res.statusCode).toBe(201)
    const corps = res.json()
    expect(typeof corps.accessLink.token).toBe('string')
    // La reponse ne porte QUE le lien : ni identite, ni identifiant de compte.
    expect(Object.keys(corps)).toEqual(['accessLink'])

    const rattachement = await testDb.establishmentMembership.findFirstOrThrow({
      where: { user: { email: 'neuve@test.fr' }, establishmentId: E },
      include: { serviceMemberships: true },
    })
    expect(rattachement.role).toBe('MEMBER')
    expect(rattachement.serviceMemberships).toHaveLength(1)
    expect(rattachement.serviceMemberships[0]).toMatchObject({
      serviceId: A,
      role: 'SECRETARIAT',
    })
  })

  it('invite un compte deja rattache ici : aucun lien, et son autre service survit', async () => {
    const res = await inviter({ email: 'polyvalent@test.fr', role: 'LECTURE' })
    expect(res.statusCode).toBe(201)
    expect(res.json().accessLink).toBeNull()

    const services = await testDb.serviceMembership.findMany({
      where: { establishmentMembership: { user: { email: 'polyvalent@test.fr' } } },
      select: { serviceId: true, role: true },
      orderBy: { createdAt: 'asc' },
    })
    expect(services).toEqual([
      { serviceId: B, role: 'INTERVENANT' },
      { serviceId: A, role: 'LECTURE' },
    ])
  })

  it('refuse une seconde invitation de la meme adresse dans le meme service', async () => {
    const res = await inviter({ email: 'polyvalent@test.fr', role: 'LECTURE' })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toMatch(/already a member of this service/)
  })

  // Les DEUX refus de `assertIssuableToken`, vus depuis cette route : c'est ce qui prouve que le
  // coeur de creation de compte est bien PARTAGE, et non recopie.
  it('refuse un compte super-admin et un compte rattache ailleurs, sans rien ecrire', async () => {
    const [superAdmin, ailleurs] = await Promise.all([
      inviter({ email: 'super@test.fr', role: 'LECTURE' }),
      inviter({ email: 'ailleurs@test.fr', role: 'LECTURE' }),
    ])
    expect([superAdmin.statusCode, ailleurs.statusCode]).toEqual([400, 400])
    // Message OPAQUE, le meme pour les deux : la route ne doit pas devenir un detecteur de
    // super-admins ni de rattachements etrangers.
    expect(superAdmin.json().message).toBe(ailleurs.json().message)
    expect(
      await testDb.serviceMembership.count({
        where: {
          serviceId: A,
          establishmentMembership: {
            user: { email: { in: ['super@test.fr', 'ailleurs@test.fr'] } },
          },
        },
      }),
    ).toBe(0)
  })

  it('peut nommer un autre coordinateur de son service', async () => {
    const cible = await affectation('polyvalent@test.fr', A)
    const res = await call(
      coordA,
      'PATCH',
      tenantUrl(E, A, `/membres/${cible.id}`),
      { role: 'COORDINATEUR' },
    )
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      role: 'COORDINATEUR',
      user: { email: 'polyvalent@test.fr' },
    })
  })

  it('ne se retrograde pas et ne se retire pas lui-meme', async () => {
    const soi = await affectation('coord-a@test.fr', A)
    const [retrogradation, retrait] = await Promise.all([
      call(coordA, 'PATCH', tenantUrl(E, A, `/membres/${soi.id}`), {
        role: 'LECTURE',
      }),
      call(coordA, 'DELETE', tenantUrl(E, A, `/membres/${soi.id}`)),
    ])
    expect([retrogradation.statusCode, retrait.statusCode]).toEqual([409, 409])
    expect((await affectation('coord-a@test.fr', A)).role).toBe('COORDINATEUR')
  })

  it('ne touche pas une affectation d un autre service, ni en ecriture ni en retrait', async () => {
    const dansB = await affectation('polyvalent@test.fr', B)
    const refus = await Promise.all([
      call(coordA, 'PATCH', tenantUrl(E, A, `/membres/${dansB.id}`), {
        role: 'LECTURE',
      }),
      call(coordA, 'DELETE', tenantUrl(E, A, `/membres/${dansB.id}`)),
    ])
    expect(refus.map((r) => r.statusCode)).toEqual([404, 404])
    expect((await affectation('polyvalent@test.fr', B)).role).toBe(
      'INTERVENANT',
    )
  })

  it('retire du SERVICE seulement : le compte, son rattachement et son autre service restent', async () => {
    const dansA = await affectation('polyvalent@test.fr', A)
    const res = await call(
      coordA,
      'DELETE',
      tenantUrl(E, A, `/membres/${dansA.id}`),
    )
    expect(res.statusCode).toBe(204)

    const rattachement = await testDb.establishmentMembership.findFirstOrThrow({
      where: { user: { email: 'polyvalent@test.fr' }, establishmentId: E },
      include: { serviceMemberships: { select: { serviceId: true } } },
    })
    expect(rattachement.serviceMemberships).toEqual([{ serviceId: B }])
    expect(
      await testDb.user.count({
        where: { email: 'polyvalent@test.fr', deactivatedAt: null },
      }),
    ).toBe(1)
  })

  // Le journal doit distinguer « le coordinateur a affecte X a son service » de « le chef
  // d'etablissement a rattache X a l'etablissement » : des actions a part, et datees du SERVICE
  // courant — l'ecran d'activite du service est le seul a pouvoir les montrer.
  it('journalise les quatre actions sous le service courant', async () => {
    const attendues = [
      'serviceMember.accountCreated',
      'serviceMember.added',
      'serviceMember.updated',
      'serviceMember.removed',
    ]
    for (let essai = 0; essai < 40; essai += 1) {
      const lignes = await testDb.activityLog.findMany({
        where: { action: { in: attendues } },
      })
      if (new Set(lignes.map((l) => l.action)).size === attendues.length) {
        expect(
          lignes.every((l) => l.establishmentId === E && l.serviceId === A),
        ).toBe(true)
        expect(lignes.every((l) => l.entityType === 'member')).toBe(true)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error('les quatre actions de service ne sont pas journalisees')
  })
})
