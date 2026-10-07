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

// Soignants et salles propres a chaque service (2026-09-29). Un soignant est un METIER du service,
// une salle un lieu du service ; le coordinateur les gere (`referentials:write`) et regle, depuis
// son service, quel membre incarne quel soignant (`ServiceMembership.soignantId`).
//
// Un seul scenario, monte une fois : la connexion est limitee en debit par instance
// d'application, et chaque cas ne lit ou n'ecrit que ce qu'il a besoin d'eprouver.
describe('soignants et salles a l echelle du service', () => {
  let t: TestApp
  let E: string
  let A: string
  let B: string
  let coordA: { access_token: string }
  let intervenantA: { access_token: string }
  let admin: { access_token: string }
  let membreId: string

  const call = (
    cookies: { access_token: string },
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) => t.app.inject({ method, url, cookies, ...(payload ? { payload } : {}) })

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    E = (await createEstablishment('CHU Haut-Leveque')).id
    A = (await createService(E, 'Cardiologie')).id
    B = (await createService(E, 'Pneumologie')).id
    await createUser({
      email: 'coord@test.fr',
      memberships: [
        {
          establishmentId: E,
          services: [{ serviceId: A, role: 'COORDINATEUR' }],
        },
      ],
    })
    await createUser({
      email: 'intervenant@test.fr',
      memberships: [
        {
          establishmentId: E,
          services: [
            { serviceId: A, role: 'INTERVENANT' },
            { serviceId: B, role: 'INTERVENANT' },
          ],
        },
      ],
    })
    await createUser({
      email: 'admin@test.fr',
      memberships: [{ establishmentId: E, role: 'ADMIN' }],
    })
    coordA = await signIn(t.app, 'coord@test.fr')
    intervenantA = await signIn(t.app, 'intervenant@test.fr')
    admin = await signIn(t.app, 'admin@test.fr')
    membreId = (
      await testDb.establishmentMembership.findFirstOrThrow({
        where: { user: { email: 'intervenant@test.fr' } },
      })
    ).id
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  it('le coordinateur cree, renomme et supprime un soignant et une salle de son service', async () => {
    const soignant = await call(coordA, 'POST', tenantUrl(E, A, '/soignant'), {
      name: 'Dieteticienne',
    })
    expect(soignant.statusCode).toBe(201)
    const salle = await call(coordA, 'POST', tenantUrl(E, A, '/location'), {
      name: 'Salle d education 1',
    })
    expect(salle.statusCode).toBe(201)

    const renomme = await call(
      coordA,
      'PATCH',
      tenantUrl(E, A, `/soignant/${soignant.json().id}`),
      {
        name: 'Dieteticien(ne)',
        active: true,
      },
    )
    expect(renomme.statusCode).toBe(200)

    // Propre au service A : invisible depuis B, meme pour un membre des deux services.
    const dansB = await call(intervenantA, 'GET', tenantUrl(E, B, '/soignant'))
    expect(dansB.statusCode).toBe(200)
    expect(dansB.json()).toEqual([])

    expect(
      (
        await call(
          coordA,
          'DELETE',
          tenantUrl(E, A, `/location/${salle.json().id}`),
        )
      ).statusCode,
    ).toBe(204)
  })

  it('refuse l ecriture a un intervenant, qui garde la lecture', async () => {
    expect(
      (
        await call(intervenantA, 'POST', tenantUrl(E, A, '/soignant'), {
          name: 'X',
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await call(intervenantA, 'POST', tenantUrl(E, A, '/location'), {
          name: 'X',
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (await call(intervenantA, 'GET', tenantUrl(E, A, '/soignant')))
        .statusCode,
    ).toBe(200)
  })

  it('les anciennes routes d administration n existent plus', async () => {
    expect(
      (await call(admin, 'GET', adminUrl(E, '/soignant'))).statusCode,
    ).toBe(404)
    expect(
      (await call(admin, 'GET', adminUrl(E, '/location'))).statusCode,
    ).toBe(404)
  })

  it('le coordinateur rattache un membre de son service a un soignant de son service, et /me le reflete', async () => {
    const infirmiere = await call(
      coordA,
      'POST',
      tenantUrl(E, A, '/soignant'),
      { name: 'Infirmiere d education' },
    )
    const membres = await call(coordA, 'GET', tenantUrl(E, A, '/membres'))
    expect(membres.statusCode).toBe(200)
    // Les membres du service A seulement : le coordinateur et l'intervenant, pas l'administrateur.
    expect(
      membres
        .json()
        .map((m: { user: { email: string } }) => m.user.email)
        .sort(),
    ).toEqual(['coord@test.fr', 'intervenant@test.fr'])
    const affectation = membres
      .json()
      .find(
        (m: { user: { email: string } }) =>
          m.user.email === 'intervenant@test.fr',
      )

    const rattache = await call(
      coordA,
      'PATCH',
      tenantUrl(E, A, `/membres/${affectation.id}/soignant`),
      {
        soignantId: infirmiere.json().id,
      },
    )
    expect(rattache.statusCode).toBe(200)
    expect(rattache.json()).toMatchObject({
      soignantId: infirmiere.json().id,
      user: { email: 'intervenant@test.fr' },
    })

    const me = await call(intervenantA, 'GET', '/me')
    const services = me.json().establishments[0].services as {
      id: string
      soignantId: string | null
    }[]
    expect(services.find((s) => s.id === A)?.soignantId).toBe(
      infirmiere.json().id,
    )
    expect(services.find((s) => s.id === B)?.soignantId).toBeNull()

    // Garder ses services depuis l'administration ne perd pas le rattachement.
    const maj = await call(
      admin,
      'PATCH',
      adminUrl(E, `/members/${membreId}`),
      {
        services: [
          { serviceId: A, role: 'INTERVENANT' },
          { serviceId: B, role: 'LECTURE' },
        ],
      },
    )
    expect(maj.statusCode).toBe(200)
    const apres = await testDb.serviceMembership.findFirstOrThrow({
      where: { id: affectation.id },
    })
    expect(apres.soignantId).toBe(infirmiere.json().id)
  })

  it('refuse un soignant d un autre service et une affectation d un autre service', async () => {
    const soignantB = await testDb.soignant.create({
      data: { name: 'Kine', establishmentId: E, serviceId: B },
    })
    const membres = (
      await call(coordA, 'GET', tenantUrl(E, A, '/membres'))
    ).json() as { id: string }[]
    const affectationA = membres.at(0)?.id ?? ''
    const affectationB = (
      await testDb.serviceMembership.findFirstOrThrow({
        where: { serviceId: B },
      })
    ).id

    expect(
      (
        await call(
          coordA,
          'PATCH',
          tenantUrl(E, A, `/membres/${affectationA}/soignant`),
          { soignantId: soignantB.id },
        )
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await call(
          coordA,
          'PATCH',
          tenantUrl(E, A, `/membres/${affectationB}/soignant`),
          { soignantId: null },
        )
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await call(
          intervenantA,
          'PATCH',
          tenantUrl(E, A, `/membres/${affectationA}/soignant`),
          { soignantId: null },
        )
      ).statusCode,
    ).toBe(403)
  })

  it('le coordinateur invite avec un soignant, chacun regle ensuite le sien', async () => {
    const kine = (
      await call(coordA, 'POST', tenantUrl(E, A, '/soignant'), { name: 'Kine' })
    ).json()
    const soignantB = await testDb.soignant.create({
      data: { name: 'Dieteticien', establishmentId: E, serviceId: B },
    })

    expect(
      (
        await call(coordA, 'POST', tenantUrl(E, A, '/membres'), {
          email: 'ailleurs@test.fr',
          role: 'INTERVENANT',
          soignantId: soignantB.id,
        })
      ).statusCode,
    ).toBe(404)

    const invite = await call(coordA, 'POST', tenantUrl(E, A, '/membres'), {
      email: 'kine@test.fr',
      role: 'INTERVENANT',
      soignantId: kine.id,
    })
    expect(invite.statusCode).toBe(201)
    const affectation = await testDb.serviceMembership.findFirstOrThrow({
      where: { establishmentMembership: { user: { email: 'kine@test.fr' } } },
    })
    expect(affectation.soignantId).toBe(kine.id)

    const moi = await call(
      intervenantA,
      'PATCH',
      tenantUrl(E, A, '/membres/me/soignant'),
      { soignantId: kine.id },
    )
    expect(moi.statusCode).toBe(200)
    expect(moi.json()).toMatchObject({
      soignantId: kine.id,
      user: { email: 'intervenant@test.fr' },
    })
    expect(
      (
        await call(
          intervenantA,
          'PATCH',
          tenantUrl(E, A, '/membres/me/soignant'),
          { soignantId: soignantB.id },
        )
      ).statusCode,
    ).toBe(404)

    const services = (await call(intervenantA, 'GET', '/me')).json()
      .establishments[0].services as {
      id: string
      soignantId: string | null
      affecte: boolean
    }[]
    expect(services.find((s) => s.id === A)).toMatchObject({
      soignantId: kine.id,
      affecte: true,
    })

    // Le chef d'etablissement est coordinateur implicite, sans affectation a regler.
    const adminServices = (await call(admin, 'GET', '/me')).json()
      .establishments[0].services as { id: string; affecte: boolean }[]
    expect(adminServices.find((s) => s.id === A)?.affecte).toBe(false)
    expect(
      (
        await call(admin, 'PATCH', tenantUrl(E, A, '/membres/me/soignant'), {
          soignantId: null,
        })
      ).statusCode,
    ).toBe(404)
  })

  it('le chef d etablissement choisit le soignant de chaque affectation', async () => {
    const ide = (
      await call(coordA, 'POST', tenantUrl(E, A, '/soignant'), { name: 'IDE' })
    ).json()
    const soignantB = await testDb.soignant.create({
      data: { name: 'APA', establishmentId: E, serviceId: B },
    })

    expect(
      (
        await call(admin, 'POST', adminUrl(E, '/members/account'), {
          email: 'mauvais@test.fr',
          role: 'MEMBER',
          services: [
            { serviceId: A, role: 'INTERVENANT', soignantId: soignantB.id },
          ],
        })
      ).statusCode,
    ).toBe(404)

    const cree = await call(admin, 'POST', adminUrl(E, '/members/account'), {
      email: 'ide@test.fr',
      role: 'MEMBER',
      services: [{ serviceId: A, role: 'INTERVENANT', soignantId: ide.id }],
    })
    expect(cree.statusCode).toBe(201)
    const id = cree.json().member.id

    const maj = await call(admin, 'PATCH', adminUrl(E, `/members/${id}`), {
      services: [
        { serviceId: A, role: 'INTERVENANT', soignantId: null },
        { serviceId: B, role: 'LECTURE', soignantId: soignantB.id },
      ],
    })
    expect(maj.statusCode).toBe(200)

    const membres = (await call(admin, 'GET', adminUrl(E, '/members'))).json()
    const membre = membres.find((m: { id: string }) => m.id === id)
    expect(membre.serviceMemberships).toEqual(
      expect.arrayContaining([
        { serviceId: A, role: 'INTERVENANT', soignantId: null },
        { serviceId: B, role: 'LECTURE', soignantId: soignantB.id },
      ]),
    )
  })
  it('le coordinateur cree et modifie une thematique avec des soignants', async () => {
    const soignant = (
      await call(coordA, 'POST', tenantUrl(E, A, '/soignant'), {
        name: 'Dieteticien',
      })
    ).json()
    const cree = await call(coordA, 'POST', tenantUrl(E, A, '/thematic'), {
      name: 'Nutrition',
      soignantIDs: [soignant.id],
    })
    expect(cree.statusCode).toBe(201)
    expect(cree.json().soignants).toEqual([
      { id: soignant.id, name: 'Dieteticien' },
    ])

    const maj = await call(
      coordA,
      'PATCH',
      tenantUrl(E, A, `/thematic/${cree.json().id}`),
      { soignantIDs: [soignant.id] },
    )
    expect(maj.statusCode).toBe(200)
    expect(maj.json().soignants).toHaveLength(1)
  })
  it('refuse de lier a une thematique ou a un creneau un soignant d un autre service', async () => {
    const etranger = await testDb.soignant.create({
      data: { name: 'Soignant de B', serviceId: B, establishmentId: E },
    })
    const thematique = await call(
      coordA,
      'POST',
      tenantUrl(E, A, '/thematic'),
      {
        name: 'Thematique piege',
        soignantIDs: [etranger.id],
      },
    )
    expect(thematique.statusCode).toBeGreaterThanOrEqual(400)
    const modele = await call(
      coordA,
      'POST',
      tenantUrl(E, A, '/slot-template'),
      {
        startTime: '2026-11-02T09:00:00.000Z',
        endTime: '2026-11-02T10:00:00.000Z',
        offsetDays: 0,
        color: '#123456',
        isIndividual: false,
        soignantIDs: [etranger.id],
      },
    )
    expect(modele.statusCode).toBeGreaterThanOrEqual(400)
    expect(
      await testDb.soignantThematic.count({
        where: { soignantId: etranger.id },
      }),
    ).toBe(0)
    expect(
      await testDb.slotTemplateSoignant.count({
        where: { soignantId: etranger.id },
      }),
    ).toBe(0)
  })

  describe('liens soignants des creneaux', () => {
    const creneau = {
      startTime: '2026-11-02T09:00:00.000Z',
      endTime: '2026-11-02T10:00:00.000Z',
      offsetDays: 0,
      color: '#123456',
      isIndividual: false,
    }
    const nouveauSoignant = async (name: string): Promise<string> =>
      (
        await call(coordA, 'POST', tenantUrl(E, A, '/soignant'), { name })
      ).json().id

    it('cree et modifie un modele de creneau avec des soignants', async () => {
      const s1 = await nouveauSoignant('Infirmier modele')
      const s2 = await nouveauSoignant('Medecin modele')
      const cree = await call(
        coordA,
        'POST',
        tenantUrl(E, A, '/slot-template'),
        {
          ...creneau,
          soignantIDs: [s1],
        },
      )
      expect(cree.statusCode).toBe(201)
      expect(cree.json().soignants.map((s: { id: string }) => s.id)).toEqual([
        s1,
      ])

      const maj = await call(
        coordA,
        'PATCH',
        tenantUrl(E, A, `/slot-template/${cree.json().id}`),
        { soignantIDs: [s1, s2] },
      )
      expect(maj.statusCode).toBe(200)
      expect(
        maj
          .json()
          .soignants.map((s: { id: string }) => s.id)
          .sort(),
      ).toEqual([s1, s2].sort())
    })

    it('cree un creneau avec son modele et ses soignants, puis les remplace', async () => {
      const s1 = await nouveauSoignant('Kine creneau')
      const s2 = await nouveauSoignant('Psy creneau')
      const cree = await call(coordA, 'POST', tenantUrl(E, A, '/slot'), {
        startDate: '2026-11-03T09:00:00.000Z',
        endDate: '2026-11-03T10:00:00.000Z',
        slotTemplate: { ...creneau, soignantIDs: [s1] },
      })
      expect(cree.statusCode).toBe(201)
      expect(
        cree.json().slotTemplate.soignants.map((s: { id: string }) => s.id),
      ).toEqual([s1])

      const maj = await call(
        coordA,
        'PATCH',
        tenantUrl(E, A, `/slot/${cree.json().id}`),
        {
          slotTemplate: { id: cree.json().slotTemplate.id, soignantIDs: [s2] },
        },
      )
      expect(maj.statusCode).toBe(200)
      expect(
        maj.json().slotTemplate.soignants.map((s: { id: string }) => s.id),
      ).toEqual([s2])
    })

    it('la regeneration d un parcours recopie les soignants du modele', async () => {
      const s1 = await nouveauSoignant('Dieteticien parcours')
      const modele = (
        await call(coordA, 'POST', tenantUrl(E, A, '/slot-template'), {
          ...creneau,
          soignantIDs: [s1],
        })
      ).json()
      const parcoursType = await call(
        coordA,
        'POST',
        tenantUrl(E, A, '/pathway-template'),
        {
          name: 'Parcours regenere',
          color: '#654321',
          mainTag: 'ETP',
          slotTemplateIDs: [modele.id],
        },
      )
      expect(parcoursType.statusCode).toBe(201)
      const pathway = await testDb.pathway.create({
        data: {
          establishmentId: E,
          serviceId: A,
          startDate: new Date('2026-11-09'),
          templateID: parcoursType.json().id,
        },
      })

      const regen = await call(
        coordA,
        'POST',
        tenantUrl(E, A, '/pathway/regenerate'),
        {
          pathwayTemplateID: parcoursType.json().id,
          fromDate: '2026-11-01',
        },
      )
      expect(regen.statusCode).toBe(200)
      expect(regen.json().slotsCreated).toBe(1)

      const slot = await testDb.slot.findFirstOrThrow({
        where: { pathwayID: pathway.id },
        include: { slotTemplate: { include: { soignantLinks: true } } },
      })
      expect(slot.slotTemplate.id).not.toBe(modele.id)
      expect(slot.slotTemplate.soignantLinks).toEqual([
        expect.objectContaining({
          soignantId: s1,
          serviceId: A,
          establishmentId: E,
        }),
      ])
    })
  })
})
