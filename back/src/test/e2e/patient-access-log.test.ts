import Fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'

import { loadConfig } from '../../main/application/config'
import { startIocContainer } from '../../main/application/starter'
import { plugins } from '../../main/interfaces/http/fastify/plugins'
import { tenantRoutes } from '../../main/interfaces/http/fastify/routes/tenant.routes'
import {
  EXEMPTED_PATIENT_ROUTES,
  LOGGED_PATIENT_ROUTES,
  patientIdParamOf,
} from '../../main/utils/access-log-routes'
import '../../main/utils/date'
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

const TENANT_PREFIX = '/e/:establishmentId/s/:serviceId'

// Un identifiant syntaxiquement valide (cuid) qui n'existe dans aucune table : la route de
// lecture du dossier repond alors 404, en passant par le handler — exactement le chemin
// d'erreur que le crochet doit ignorer. Meme convention que permissions.test.ts.
const PATIENT_INCONNU = 'clzzzzzzzzzzzzzzzzzzzzzzz'

// `app.inject` rend la main quand la reponse est terminee ; le crochet `onResponse` qui ecrit la
// ligne, lui, est asynchrone et n'est pas forcement acheve a cet instant. Attendre une condition
// plutot que dormir un temps fixe.
const attendre = async (
  condition: () => Promise<boolean>,
  quoi: string,
): Promise<void> => {
  for (let essai = 0; essai < 100; essai += 1) {
    if (await condition()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Condition jamais atteinte : ${quoi}`)
}

describe('journal des consultations : le crochet sur le chemin reel', () => {
  let testApp: TestApp
  let etab: { id: string }
  let service: { id: string }
  let autreEtab: { id: string }
  let autreService: { id: string }
  let patient: { id: string }
  // Un SECOND patient, reserve a la requete-barriere. C'est ce qui rend les tests « aucune
  // ligne » non ambigus : la ligne attendue porte un patientId distinct, donc attendre son
  // arrivee ne peut pas etre satisfait par la ligne qu'un crochet sabote aurait ecrite pour le
  // premier patient (mesure par sabotage : avec un seul patient, la course rendait le test vert
  // a tort).
  let patientBarriere: { id: string }
  let cookies: { access_token: string }
  // Un compte du meme service, sans `clinical:read` : il recoit 403 sur une route JOURNALISEE,
  // pour un patient qui EXISTE. C'est le seul moyen d'eprouver la garde de statut toute seule —
  // voir le commentaire du test concerne.
  let cookiesLecture: { access_token: string }

  beforeAll(async () => {
    await truncateAll()
    testApp = await buildTestApp()

    etab = await createEstablishment('Journal')
    service = await createService(etab.id, 'Service journal')
    autreEtab = await createEstablishment('Ailleurs')
    autreService = await createService(autreEtab.id, 'Service ailleurs')

    const user = await createUser({
      email: 'journal@test.fr',
      memberships: [
        {
          establishmentId: etab.id,
          services: [{ serviceId: service.id, role: 'COORDINATEUR' }],
        },
      ],
    })
    await testDb.user.update({
      where: { id: user.id },
      data: { firstName: 'Ada', lastName: 'Lovelace' },
    })

    patient = await testDb.patient.create({
      data: {
        firstName: 'Jean',
        lastName: 'Patient',
        createDate: new Date(),
        establishmentId: etab.id,
      },
    })
    await testDb.patientServiceFile.create({
      data: {
        patientId: patient.id,
        serviceId: service.id,
        establishmentId: etab.id,
      },
    })
    patientBarriere = await testDb.patient.create({
      data: {
        firstName: 'Barriere',
        lastName: 'Temoin',
        createDate: new Date(),
        establishmentId: etab.id,
      },
    })
    await testDb.patientServiceFile.create({
      data: {
        patientId: patientBarriere.id,
        serviceId: service.id,
        establishmentId: etab.id,
      },
    })

    await createUser({
      email: 'lecture@test.fr',
      memberships: [
        {
          establishmentId: etab.id,
          services: [{ serviceId: service.id, role: 'LECTURE' }],
        },
      ],
    })

    cookies = await signIn(testApp.app, 'journal@test.fr')
    cookiesLecture = await signIn(testApp.app, 'lecture@test.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    await testDb.patientAccessLog.deleteMany()
  })

  const ouvrirDossier = (patientId: string) =>
    testApp.app.inject({
      method: 'GET',
      url: tenantUrl(etab.id, service.id, `/patient/${patientId}`),
      cookies,
    })

  // Requete-barriere : elle emprunte exactement le meme chemin que la requete eprouvee, sur un
  // AUTRE patient, donc sa ligne ne peut arriver qu'APRES celle qu'aurait ecrite la requete
  // eprouvee. Quand elle est la, le compte est definitif — c'est ce qui evite de conclure
  // « aucune ligne » d'une course gagnee de justesse.
  const barriere = async () => {
    const res = await ouvrirDossier(patientBarriere.id)
    expect(res.statusCode).toBe(200)
    await attendre(
      async () =>
        (await testDb.patientAccessLog.count({
          where: { patientId: patientBarriere.id },
        })) === 1,
      'la ligne de la requete-barriere est ecrite',
    )
  }

  it("ecrit une ligne complete a l ouverture d un dossier, sans jamais de contenu clinique", async () => {
    const res = await ouvrirDossier(patient.id)
    expect(res.statusCode).toBe(200)
    await attendre(
      async () => (await testDb.patientAccessLog.count()) === 1,
      'la ligne du journal est ecrite',
    )
    const lignes = await testDb.patientAccessLog.findMany()
    expect(lignes).toHaveLength(1)
    expect(lignes[0]).toEqual(
      expect.objectContaining({
        establishmentId: etab.id,
        serviceId: service.id,
        patientId: patient.id,
        userFirstName: 'Ada',
        userLastName: 'Lovelace',
        action: 'dossier.ouvert',
        accesParOctroi: false,
        exportCount: null,
        exportFilters: null,
      }),
    )
  })

  it("distingue le sous-dossier de service de l ouverture du dossier", async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: tenantUrl(
        etab.id,
        service.id,
        `/patient/${patient.id}/service-file`,
      ),
      cookies,
    })
    expect(res.statusCode).toBe(200)
    await attendre(
      async () => (await testDb.patientAccessLog.count()) === 1,
      'la ligne du sous-dossier est ecrite',
    )
    const [ligne] = await testDb.patientAccessLog.findMany()
    expect(ligne?.action).toBe('sousDossier.ouvert')
  })

  // Les deux routes de diagnostic sont un ECART assume par rapport aux listes du cahier des
  // charges (voir le rapport). Les inscrire ne suffit pas : ce test verifie qu'une ligne est
  // REELLEMENT ecrite pour elles — c'est aussi la preuve que la detection du parametre
  // fonctionne sur l'orthographe `:patientId`, dont le crochet a besoin pour lire
  // `request.params`.
  it("journalise la lecture du diagnostic educatif, malgre l autre orthographe du parametre", async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: tenantUrl(etab.id, service.id, `/patient/${patient.id}/diagnostic`),
      cookies,
    })
    expect(res.statusCode).toBe(200)
    await attendre(
      async () => (await testDb.patientAccessLog.count()) === 1,
      'la ligne du diagnostic est ecrite',
    )
    const [ligne] = await testDb.patientAccessLog.findMany()
    expect({ action: ligne?.action, patientId: ligne?.patientId }).toEqual({
      action: 'sousDossier.ouvert',
      patientId: patient.id,
    })
  })

  // LE POINT DE LA REVIEW FOCUS n°1. Non vide par construction : la comparaison porte sur un
  // dossier qui EXISTE et un qui n'existe pas, sur la MEME route et avec les MEMES droits. Sans
  // la premiere moitie, « zero ligne » ne distinguerait pas « le crochet a refuse l'erreur » de
  // « le crochet n'ecrit jamais rien ».
  //
  // ET IL FAUT LES DEUX ERREURS, pas seulement le 404 — mesure par sabotage, pas supposee. Avec
  // le seul 404 sur un identifiant INCONNU, retirer la garde `reply.statusCode >= 400` du
  // crochet laissait ce test VERT : la ligne partait bien a l'ecriture, mais la cle etrangere
  // `PatientAccessLog.patient` (prisma/schema.prisma) la refusait, le `catch` l'absorbait, et
  // « zero ligne » etait vrai POUR UNE AUTRE RAISON que celle que le nom de ce test annonce.
  // Le 403 ci-dessous ferme ce trou : le patient EXISTE, la route est JOURNALISEE, seule la
  // permission manque — rien d'autre que la garde de statut n'empeche alors l'ecriture.
  it("n ecrit aucune ligne quand la reponse est une erreur, alors qu elle en ecrit une quand elle ne l est pas", async () => {
    const sansPermission = await testApp.app.inject({
      method: 'GET',
      url: tenantUrl(etab.id, service.id, `/patient/${patient.id}/diagnostic`),
      cookies: cookiesLecture,
    })
    expect(sansPermission.statusCode).toBe(403)

    const enErreur = await ouvrirDossier(PATIENT_INCONNU)
    expect(enErreur.statusCode).toBe(404)

    await barriere()

    const lignes = await testDb.patientAccessLog.findMany()
    expect(lignes).toHaveLength(1)
    expect(lignes[0]?.patientId).toBe(patientBarriere.id)
  })

  // LE POINT DE LA REVIEW FOCUS n°2. `request.tenant` est optionnel par construction : la
  // resolution repond 404 AVANT le handler, donc il vaut `undefined` quand le crochet s'execute.
  //
  // RESERVE, dite plutot que tue (voir le rapport) : sur CE chemin, la garde de statut suffit
  // deja a sortir, donc ce test n'isole PAS la garde `request.tenant` — aucune requete HTTP ne
  // peut produire « succes ET tenant absent » sous `tenantRoutes`. C'est le test unitaire
  // (access-log-hook.test.ts, « n ecrit rien, et ne leve pas, quand le tenant n est pas
  // resolu ») qui l'eprouve seule, avec un code de succes.
  it("n ecrit aucune ligne, et ne casse pas la reponse, quand le tenant n a pas ete resolu", async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: tenantUrl(autreEtab.id, autreService.id, `/patient/${patient.id}`),
      cookies,
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).not.toHaveProperty('stack')

    await barriere()
    const lignes = await testDb.patientAccessLog.findMany()
    expect(lignes).toHaveLength(1)
    expect(lignes[0]?.patientId).toBe(patientBarriere.id)
  })

  it("n ecrit aucune ligne pour une route exemptee", async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: tenantUrl(etab.id, service.id, `/patient/${patient.id}/pathways`),
      cookies,
    })
    expect(res.statusCode).toBe(200)

    await barriere()
    const lignes = await testDb.patientAccessLog.findMany()
    expect(lignes).toHaveLength(1)
    expect(lignes[0]?.patientId).toBe(patientBarriere.id)
  })
})

// ---------------------------------------------------------------------------
// La propriete centrale, sur le chemin reel : une route neuve non declaree
// empeche l application de devenir prete.
// ---------------------------------------------------------------------------

// Monte le VRAI greffon `tenantRoutes` (donc ses vrais crochets `onRoute`/`onReady`) sur une
// instance Fastify neuve, et laisse l'appelant y poser une route de plus. Les `register` ne sont
// volontairement pas attendus : c'est `ready()` qui doit trancher, et c'est ce qu'on mesure.
const monterAvecRouteEnPlus = (
  enPlus?: (fastify: FastifyInstance) => void,
): { app: FastifyInstance; routesLues: string[] } => {
  const container = startIocContainer(loadConfig())
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.iocContainer = container.instances
  // Collecte les URL DECLAREES telles que Fastify les enregistre, pour la comparaison des deux
  // listes aux routes reelles plus bas — `printRoutes` ne conviendrait pas : il rend l'arbre du
  // routeur, ou deux routes qui partagent une position mais pas le nom du parametre fusionnent
  // en `:patientID|:patientId`.
  const routesLues: string[] = []
  app.addHook('onRoute', (route) => {
    const methodes = Array.isArray(route.method)
      ? route.method.map(String)
      : [String(route.method)]
    if (methodes.includes('GET') && patientIdParamOf(route.url) !== null) {
      routesLues.push(route.url)
    }
  })
  void app.register(plugins)
  // Le prefixe vient de routes/index.ts dans l'application reelle ; sans lui, les URL declarees
  // ne seraient pas celles que portent les deux listes, et ce harnais mesurerait autre chose.
  void app.register(
    async (child) => {
      await (
        tenantRoutes as unknown as (
          fastify: FastifyInstance,
          options: unknown,
        ) => Promise<void>
      )(child, {})
      enPlus?.(child)
    },
    { prefix: TENANT_PREFIX },
  )
  return { app, routesLues }
}

// Un `close` sur une application dont le demarrage a echoue n'a rien a fermer proprement : ne
// pas laisser son echec masquer celui que le test vient de mesurer.
const fermer = (app: FastifyInstance) => app.close().catch(() => undefined)

describe('journal des consultations : le garde-fou de demarrage', () => {
  // Temoin negatif, sans lequel le test suivant ne prouverait rien : le harnais lui-meme
  // demarre. Sans cette ligne, un `rejects.toThrow` pourrait etre satisfait par n'importe quelle
  // erreur de montage.
  it('demarre normalement quand toutes les routes sont declarees', async () => {
    const { app } = monterAvecRouteEnPlus()
    await expect(app.ready()).resolves.toBeDefined()
    await fermer(app)
  }, 30000)

  // Les deux listes confrontees aux routes REELLES du greffon, dans les deux sens, plutot qu'a
  // un echantillon recopie. Le garde-fou `onRoute` tient deja le sens « une route reelle absente
  // des listes » ; ce test le redit en une seule assertion lisible et ajoute l'autre sens, celui
  // que `onReady` tient au demarrage. Portee exacte : les routes de `tenantRoutes`, c'est-a-dire
  // exactement celles que le crochet d'ecriture couvre — pas l'application entiere.
  it('couvre exactement les routes GET reelles qui designent un dossier patient', async () => {
    const { app, routesLues } = monterAvecRouteEnPlus()
    await app.ready()
    // Garde de l'enumeration elle-meme : un collecteur casse rendrait `[]`, et la comparaison
    // ci-dessous serait vraie par vacuite des que les deux listes seraient vides elles aussi.
    expect(routesLues.length).toBeGreaterThan(0)
    expect([...routesLues].sort()).toEqual(
      [
        ...Object.keys(LOGGED_PATIENT_ROUTES),
        ...Object.keys(EXEMPTED_PATIENT_ROUTES),
      ].sort(),
    )
    await fermer(app)
  }, 30000)

  it("refuse de demarrer si une route de service portant :patientID n est ni journalisee ni exemptee", async () => {
    const { app } = monterAvecRouteEnPlus((child) => {
      child.get(
        `${TENANT_PREFIX}/patient/:patientID/inedite`,
        { config: { permission: 'patient:read' } },
        () => ({}),
      )
    })
    await expect(app.ready()).rejects.toThrow(/inedite/)
    await fermer(app)
  }, 30000)

  // Meme propriete, avec l'autre orthographe du parametre : c'est celle des routes de
  // diagnostic, et une detection litterale sur `:patientID` l'aurait laissee passer.
  it('refuse aussi de demarrer sur l orthographe :patientId', async () => {
    const { app } = monterAvecRouteEnPlus((child) => {
      child.get(
        `${TENANT_PREFIX}/patient/:patientId/inedite-minuscule`,
        { config: { permission: 'patient:read' } },
        () => ({}),
      )
    })
    await expect(app.ready()).rejects.toThrow(/inedite-minuscule/)
    await fermer(app)
  }, 30000)
})
