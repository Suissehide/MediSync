import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  adminUrl,
  createEstablishment,
  createUser,
  signIn,
  tenantUrl,
  twoServicesScenario,
} from './setup/fixtures'

// Chaque cas crée une ressource dans le service B, la demande depuis le
// service A (censé n'en rien savoir) puis depuis B (son propriétaire). Le
// contrepoint depuis B est ce qui distingue un vrai 404 de cloisonnement
// d'un 404 de test mal préparé : si la préparation avait échoué, ou si la
// route était mal écrite, le propriétaire échouerait aussi.
type IsolationCase = {
  name: string
  create: (serviceId: string, establishmentId: string) => Promise<string>
  path: (id: string) => string
  methods?: ('GET' | 'DELETE')[]
}

const cases: IsolationCase[] = [
  {
    name: 'thematic',
    create: (s, e) =>
      testDb.thematic
        .create({ data: { name: 'T', serviceId: s, establishmentId: e } })
        .then((r) => r.id),
    path: (id) => `/thematic/${id}`,
  },
  {
    name: 'pathway-template',
    create: (s, e) =>
      testDb.pathwayTemplate
        .create({
          data: {
            name: 'P',
            color: '#fff',
            mainTag: 'x',
            secondaryTags: [],
            serviceId: s,
            establishmentId: e,
          },
        })
        .then((r) => r.id),
    path: (id) => `/pathway-template/${id}`,
  },
  {
    name: 'diagnostic-template',
    create: (s, e) =>
      testDb.diagnosticEducatifTemplate
        .create({
          data: {
            name: 'D',
            activeFields: [],
            serviceId: s,
            establishmentId: e,
          },
        })
        .then((r) => r.id),
    path: (id) => `/diagnostic-template/${id}`,
  },
  {
    name: 'slot-template',
    create: (s, e) =>
      testDb.slotTemplate
        .create({
          data: {
            startTime: new Date(),
            endTime: new Date(),
            offsetDays: 0,
            isIndividual: true,
            color: '#fff',
            serviceId: s,
            establishmentId: e,
          },
        })
        .then((r) => r.id),
    path: (id) => `/slot-template/${id}`,
  },
  {
    name: 'todo',
    create: (s, e) =>
      testDb.todo
        .create({
          data: {
            title: 't',
            createDate: new Date(),
            completed: false,
            serviceId: s,
            establishmentId: e,
          },
        })
        .then((r) => r.id),
    path: (id) => `/todo/${id}`,
  },
  {
    name: 'forbidden-week',
    create: (s, e) =>
      testDb.forbiddenWeek
        .create({
          data: {
            startOfWeek: new Date('2026-01-05'),
            serviceId: s,
            establishmentId: e,
          },
        })
        .then((r) => r.id),
    path: (id) => `/forbidden-week/${id}`,
    methods: ['DELETE'],
  },
  {
    name: 'slot',
    create: async (s, e) => {
      const template = await testDb.slotTemplate.create({
        data: {
          startTime: new Date(),
          endTime: new Date(),
          offsetDays: 0,
          isIndividual: true,
          color: '#fff',
          serviceId: s,
          establishmentId: e,
        },
      })
      const slot = await testDb.slot.create({
        data: {
          startDate: new Date('2026-01-05T09:00:00Z'),
          endDate: new Date('2026-01-05T10:00:00Z'),
          serviceId: s,
          establishmentId: e,
          slotTemplateID: template.id,
        },
      })
      return slot.id
    },
    path: (id) => `/slot/${id}`,
  },
]

describe('isolation entre services (meme etablissement)', () => {
  let t: TestApp
  // Un seul scenario, un seul couple de connexions, partagés par tous les cas
  // de la table : `POST /auth/sign-in` est limité en débit, et une connexion
  // par cas (14 pour 7 cas) le dépasserait sans rien prouver de plus.
  let scenario: Awaited<ReturnType<typeof twoServicesScenario>>

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    scenario = await twoServicesScenario(t.app)
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  describe.each(cases)(
    '$name',
    ({ create, path, methods = ['GET', 'DELETE'] }) => {
      it('404 depuis le service A sur une ressource du service B, 200/204 depuis B', async () => {
        const { est, serviceA, serviceB, cookiesA, cookiesB } = scenario
        const id = await create(serviceB.id, est.id)

        for (const method of methods) {
          const fromA = await t.app.inject({
            method,
            url: tenantUrl(est.id, serviceA.id, path(id)),
            cookies: cookiesA,
          })
          expect(fromA.statusCode).toBe(404)
        }

        // Contrepoint : le même identifiant, demandé par son propriétaire,
        // doit réussir. Sinon le 404 ci-dessus prouverait juste un identifiant
        // invalide ou une route cassée, pas un cloisonnement.
        const ownerMethod = methods[0] as 'GET' | 'DELETE'
        const fromB = await t.app.inject({
          method: ownerMethod,
          url: tenantUrl(est.id, serviceB.id, path(id)),
          cookies: cookiesB,
        })
        expect([200, 204]).toContain(fromB.statusCode)
      })
    },
  )
})

// Le patient est un modèle d'établissement (pas de service) : le cas
// d'isolation qui compte est entre deux établissements, pas entre deux
// services d'un même établissement.
describe('isolation entre etablissements : patient', () => {
  let t: TestApp

  beforeAll(async () => {
    t = await buildTestApp()
  })

  beforeEach(truncateAll)

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  it('un patient d un autre etablissement renvoie 404, et 200 pour son propre etablissement', async () => {
    const { est, serviceA, cookiesA } = await twoServicesScenario(t.app)
    const other = await createEstablishment('Autre etablissement')
    const otherPatient = await testDb.patient.create({
      data: {
        firstName: 'Etranger',
        lastName: 'P',
        createDate: new Date(),
        establishmentId: other.id,
      },
    })
    const ownPatient = await testDb.patient.create({
      data: {
        firstName: 'Local',
        lastName: 'P',
        createDate: new Date(),
        establishmentId: est.id,
      },
    })

    const foreign = await t.app.inject({
      method: 'GET',
      url: tenantUrl(est.id, serviceA.id, `/patient/${otherPatient.id}`),
      cookies: cookiesA,
    })
    expect(foreign.statusCode).toBe(404)

    const own = await t.app.inject({
      method: 'GET',
      url: tenantUrl(est.id, serviceA.id, `/patient/${ownPatient.id}`),
      cookies: cookiesA,
    })
    expect(own.statusCode).toBe(200)
  })
})

// L'établissement d'un membre n'est pas visible à un autre établissement,
// même pour la gestion des membres elle-même. Couvre le prefixe /admin,
// distinct du prefixe de service exercé ci-dessus.
describe('isolation entre etablissements : membres', () => {
  let t: TestApp

  beforeAll(async () => {
    t = await buildTestApp()
  })

  beforeEach(truncateAll)

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  it('un administrateur ne voit pas la liste des membres d un autre etablissement', async () => {
    const est = await createEstablishment('E1')
    const other = await createEstablishment('E2')
    await createUser({
      email: 'admin@test.fr',
      memberships: [{ establishmentId: est.id, role: 'ADMIN' }],
    })
    const cookies = await signIn(t.app, 'admin@test.fr')

    const res = await t.app.inject({
      method: 'GET',
      url: adminUrl(other.id, '/members'),
      cookies,
    })
    expect(res.statusCode).toBe(404)

    const own = await t.app.inject({
      method: 'GET',
      url: adminUrl(est.id, '/members'),
      cookies,
    })
    expect(own.statusCode).toBe(200)
  })
})
