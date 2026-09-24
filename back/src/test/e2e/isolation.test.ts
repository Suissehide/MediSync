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

// CONTRAT DE CE FICHIER : une ressource d'un autre tenant renvoie 404, jamais
// autre chose. Un garde-fou global (`back/src/main/infra/orm/tenant-guard.ts`)
// intercepte aussi certaines requetes Prisma mal filtrees et les transforme
// en 500 plutot qu'en fuite silencieuse — un filtre de repository disparu
// peut donc faire tomber un test ici avec un 500 au lieu d'un 200. Si cela
// arrive, LE FILTRE DOIT ETRE REMIS, PAS L'ATTENTE ELARGIE : un test qui
// accepterait "404 ou 500" ne prouverait plus rien, puisque le garde global
// ne couvre pas toutes les formes de requete (voir tenant-guard.test.ts pour
// ses limites). 404 est le contrat ; 500 est un signal d'alarme, pas une
// variante acceptable.

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
  // Code attendu du contrepoint, pour la methode `methods[0]` : un seul est
  // correct selon la methode (200 pour un GET, 204 pour un DELETE) — on ne
  // se contente pas d'accepter les deux.
  ownerStatus: 200 | 204
}

const cases: IsolationCase[] = [
  {
    name: 'thematic',
    create: (s, e) =>
      testDb.thematic
        .create({ data: { name: 'T', serviceId: s, establishmentId: e } })
        .then((r) => r.id),
    path: (id) => `/thematic/${id}`,
    ownerStatus: 200,
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
    ownerStatus: 200,
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
    ownerStatus: 200,
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
    ownerStatus: 200,
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
    ownerStatus: 200,
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
    ownerStatus: 204,
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
    ownerStatus: 200,
  },
  {
    // Le repository des rendez-vous porte son propre filtre, independant de
    // celui du creneau qui le porte : l'isolation du creneau ne le prouve
    // pas par transitivite. Le rendez-vous embarque en outre un patient
    // inscrit, dont la transmission est du contenu clinique.
    name: 'appointment',
    create: async (s, e) => {
      const patient = await testDb.patient.create({
        data: {
          firstName: 'App',
          lastName: 'Patient',
          createDate: new Date(),
          establishmentId: e,
        },
      })
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
          startDate: new Date('2026-01-06T09:00:00Z'),
          endDate: new Date('2026-01-06T10:00:00Z'),
          serviceId: s,
          establishmentId: e,
          slotTemplateID: template.id,
        },
      })
      const appointment = await testDb.appointment.create({
        data: {
          startDate: new Date('2026-01-06T09:00:00Z'),
          endDate: new Date('2026-01-06T10:00:00Z'),
          serviceId: s,
          establishmentId: e,
          slotID: slot.id,
        },
      })
      await testDb.appointmentPatient.create({
        data: {
          appointmentId: appointment.id,
          patientId: patient.id,
          serviceId: s,
          establishmentId: e,
          transmissionNotes: 'TRANSMISSION-SECRETE',
        },
      })
      return appointment.id
    },
    path: (id) => `/appointment/${id}`,
    ownerStatus: 200,
  },
]

describe('isolation par tenant', () => {
  let t: TestApp

  // Une seule instance d'application pour tout ce fichier : trois instances
  // (une par bloc) fermaient trois fois le client de base partage `testDb`,
  // ce qui coupait la connexion des blocs suivants a la premiere fermeture.
  beforeAll(async () => {
    t = await buildTestApp()
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  describe('isolation entre services (meme etablissement)', () => {
    // Un seul scenario, un seul couple de connexions, partagés par tous les
    // cas de la table : `POST /auth/sign-in` est limité en débit, et une
    // connexion par cas le dépasserait sans rien prouver de plus.
    let scenario: Awaited<ReturnType<typeof twoServicesScenario>>

    beforeAll(async () => {
      await truncateAll()
      scenario = await twoServicesScenario(t.app)
    })

    // Sonde de sante, a executer une seule fois : si les fabriques cessaient
    // un jour d'accorder a A une appartenance valide a son propre service,
    // toute requete de A rendrait 404 des la resolution du tenant — y
    // compris les requetes des cas ci-dessous, qui passeraient alors sans
    // rien prouver. Ce test isole cette hypothese : sans lui, le contrepoint
    // de chaque cas (A visite son PROPRE service via B, pas via A) ne la
    // couvrirait pas.
    it('sonde de sante : A atteint une route de son propre service', async () => {
      const { est, serviceA, cookiesA } = scenario
      const res = await t.app.inject({
        method: 'GET',
        url: tenantUrl(est.id, serviceA.id, '/thematic'),
        cookies: cookiesA,
      })
      expect(res.statusCode).toBe(200)
    })

    // Couvre le type de fuite le plus courant : un `findMany` sans clause de
    // tenant renvoie tout, de tous les services. Verifie l'appartenance par
    // identifiant plutot que la seule taille de la liste : une liste de la
    // bonne taille peut contenir la mauvaise ligne.
    it('la liste des thematiques ne contient pas celles d un autre service', async () => {
      const { est, serviceA, serviceB, cookiesA } = scenario
      const ownThematic = await testDb.thematic.create({
        data: {
          name: 'ListeA',
          serviceId: serviceA.id,
          establishmentId: est.id,
        },
      })
      const foreignThematic = await testDb.thematic.create({
        data: {
          name: 'ListeB',
          serviceId: serviceB.id,
          establishmentId: est.id,
        },
      })

      const res = await t.app.inject({
        method: 'GET',
        url: tenantUrl(est.id, serviceA.id, '/thematic'),
        cookies: cookiesA,
      })
      expect(res.statusCode).toBe(200)
      const ids = (res.json() as { id: string }[]).map((th) => th.id)
      expect(ids).toContain(ownThematic.id)
      expect(ids).not.toContain(foreignThematic.id)
    })

    describe.each(cases)(
      '$name',
      ({ create, path, methods = ['GET', 'DELETE'], ownerStatus }) => {
        it('404 depuis le service A sur une ressource du service B, succes depuis B', async () => {
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
          // doit réussir avec le code attendu pour cette méthode. Sinon le
          // 404 ci-dessus prouverait juste un identifiant invalide ou une
          // route cassée, pas un cloisonnement.
          const ownerMethod = methods[0] as 'GET' | 'DELETE'
          const fromB = await t.app.inject({
            method: ownerMethod,
            url: tenantUrl(est.id, serviceB.id, path(id)),
            cookies: cookiesB,
          })
          expect(fromB.statusCode).toBe(ownerStatus)
        })
      },
    )

    // Sous-dossier patient (etape 3 du multi-tenant). Cas dedie, hors de la
    // table `cases` ci-dessus : son ecriture est un PUT (upsert), hors du
    // type `IsolationCase`, limite a GET/DELETE. Une lecture depuis A doit
    // rendre 404 comme les autres cas ; une ECRITURE depuis A ne doit ni
    // lire ni modifier le sous-dossier de B — meme quand cette ecriture
    // reussit, parce qu'un upsert cree alors le sous-dossier PROPRE de A
    // (vide, conforme a la conception 2.1 : un second service part d'un
    // sous-dossier vierge), jamais celui de B. Le controle qui compte est
    // donc la relecture du sous-dossier de B apres coup : ses valeurs ne
    // doivent pas avoir bouge.
    it('un sous-dossier patient cree dans un service n est ni lisible ni modifiable depuis l autre', async () => {
      const { est, serviceA, serviceB, cookiesA, cookiesB } = scenario
      const patient = await testDb.patient.create({
        data: {
          firstName: 'Dossier',
          lastName: 'Service',
          createDate: new Date(),
          establishmentId: est.id,
        },
      })
      await testDb.patientServiceFile.create({
        data: {
          patientId: patient.id,
          serviceId: serviceB.id,
          establishmentId: est.id,
          notes: 'SECRET-SERVICE-B',
        },
      })

      const path = `/patient/${patient.id}/service-file`

      const readFromA = await t.app.inject({
        method: 'GET',
        url: tenantUrl(est.id, serviceA.id, path),
        cookies: cookiesA,
      })
      expect(readFromA.statusCode).toBe(404)

      const writeFromA = await t.app.inject({
        method: 'PUT',
        url: tenantUrl(est.id, serviceA.id, path),
        cookies: cookiesA,
        payload: { notes: 'ECRASE-DEPUIS-A' },
      })
      expect(writeFromA.statusCode).toBe(200)
      // La ligne creee par A porte son propre id : elle n'a ni lu ni reutilise
      // celle de B.
      const bServiceFile = await testDb.patientServiceFile.findUniqueOrThrow({
        where: { patientId_serviceId: { patientId: patient.id, serviceId: serviceB.id } },
      })
      expect(writeFromA.json().id).not.toBe(bServiceFile.id)

      const readFromB = await t.app.inject({
        method: 'GET',
        url: tenantUrl(est.id, serviceB.id, path),
        cookies: cookiesB,
      })
      expect(readFromB.statusCode).toBe(200)
      expect(readFromB.json().notes).toBe('SECRET-SERVICE-B')
    })
  })

  // Le patient est un modèle d'établissement (pas de service) : le cas
  // d'isolation qui compte est entre deux établissements, pas entre deux
  // services d'un même établissement.
  describe('isolation entre etablissements : patient', () => {
    beforeEach(truncateAll)

    it('un patient d un autre etablissement renvoie 404, et 200 pour son propre etablissement ; la liste ne fuit pas non plus', async () => {
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

      // Meme preuve que pour la liste des thematiques, mais sur une entite
      // d'etablissement (findMany filtre par establishmentId, pas serviceId).
      const list = await t.app.inject({
        method: 'GET',
        url: tenantUrl(est.id, serviceA.id, '/patient'),
        cookies: cookiesA,
      })
      expect(list.statusCode).toBe(200)
      const ids = (list.json() as { id: string }[]).map((p) => p.id)
      expect(ids).toContain(ownPatient.id)
      expect(ids).not.toContain(otherPatient.id)
    })
  })

  // L'établissement d'un membre n'est pas visible à un autre établissement,
  // même pour la gestion des membres elle-même. Couvre le prefixe /admin,
  // distinct du prefixe de service exercé ci-dessus.
  describe('isolation entre etablissements : membres', () => {
    beforeEach(truncateAll)

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

  // Route ajoutee au tour de correction 1 de la tache 8 : l'ecran des
  // membres (/e/:id/admin/members) vit sous un contexte sans service, et le
  // front visait a tort le prefixe de service (`tenantApiUrl`) pour lister
  // les soignants — une fabrique qui leve volontairement sans service en
  // contexte. Cette route de liste, montee sous /e/:id/admin/soignant,
  // reutilise `soignantDomain.findAll()` ; le repository filtre par
  // etablissement, jamais par service (voir `SoignantRepository.findAll`).
  // Ce test le prouve au niveau HTTP, sur ce nouveau prefixe.
  describe('isolation entre etablissements : soignants (admin)', () => {
    beforeEach(truncateAll)

    it('la liste des soignants d un etablissement ne contient pas ceux d un autre, et un autre etablissement renvoie 404', async () => {
      const est = await createEstablishment('E1')
      const other = await createEstablishment('E2')
      await createUser({
        email: 'admin@test.fr',
        memberships: [{ establishmentId: est.id, role: 'ADMIN' }],
      })
      const cookies = await signIn(t.app, 'admin@test.fr')

      const ownSoignant = await testDb.soignant.create({
        data: { establishmentId: est.id, name: 'Local' },
      })
      const foreignSoignant = await testDb.soignant.create({
        data: { establishmentId: other.id, name: 'Etranger' },
      })

      const foreign = await t.app.inject({
        method: 'GET',
        url: adminUrl(other.id, '/soignant'),
        cookies,
      })
      expect(foreign.statusCode).toBe(404)

      const own = await t.app.inject({
        method: 'GET',
        url: adminUrl(est.id, '/soignant'),
        cookies,
      })
      expect(own.statusCode).toBe(200)
      const ids = (own.json() as { id: string }[]).map((s) => s.id)
      expect(ids).toContain(ownSoignant.id)
      expect(ids).not.toContain(foreignSoignant.id)
    })
  })

  // Le statut ne suffit pas : le corps du 404 doit rester neutre. Les hooks
  // qui suivent `resolveTenant` (permission, filtres cliniques) s'executent
  // aussi sur la charge d'une reponse d'erreur, donc sans tenant. Quand ils
  // destructuraient `request.tenant` sans le verifier, le corps du 404
  // devenait « Cannot destructure property 'serviceRole' … » : une erreur
  // interne rendue a qui sonde des identifiants de tenant au hasard.
  describe('le corps du 404 ne revele rien', () => {
    beforeEach(truncateAll)

    it('un tenant inconnu renvoie un 404 neutre, sans message interne', async () => {
      const est = await createEstablishment('E1')
      await createUser({
        email: 'admin@test.fr',
        memberships: [{ establishmentId: est.id, role: 'ADMIN' }],
      })
      const cookies = await signIn(t.app, 'admin@test.fr')

      const urls = [
        tenantUrl(est.id, 'svc_inconnu', '/patient'),
        tenantUrl('est_inconnu', 'svc_inconnu', '/patient'),
        adminUrl('est_inconnu', '/members'),
      ]

      for (const url of urls) {
        const res = await t.app.inject({ method: 'GET', url, cookies })
        expect(res.statusCode).toBe(404)
        expect(res.body).not.toMatch(/destructure|request\.tenant|serviceRole/i)
      }
    })
  })
})
