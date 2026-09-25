import { patientServiceFileResponseSchema } from '../../main/interfaces/http/fastify/schemas/patientServiceFile.schema'
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
  twoServicesScenario,
} from './setup/fixtures'

type Cookies = { access_token: string }

const servicePath = (patientId: string) => `/patient/${patientId}/service-file`

// Le signal de suivi ailleurs (design §5.3, tache 7) : LA SEULE lecture de tout le back qui
// traverse volontairement la frontiere entre services. Ce fichier prouve, par requete HTTP
// reelle et non par relecture du code, que :
//   1. le booleen se comporte correctement (vrai / faux / faux a travers un etablissement) ;
//   2. il ne fuit jamais rien d'autre, dans la reponse comme aux yeux du filtrage clinique ;
//   3. le cloisonnement existant (un service ne lit jamais le sous-dossier d'un autre : 404,
//      jamais un objet vide) tient toujours une fois le signal branche sur la route.
// L'unicite de l'exception `runAsSystem` qui rend ce signal possible est verifiee separement,
// par lecture des sources : back/src/test/unit/infra/runAsSystem-unicite.test.ts. Le mecanisme de
// la requete elle-meme (ses deux bornes, sous quel mode) est verifie plus finement dans
// back/src/test/unit/infra/repository-scope.test.ts (describe 'PatientServiceFileRepository.
// estSuiviAilleurs').
//
// Une seule authentification par role/etablissement, partagee par tous les tests de ce fichier
// (comme clinical-fields.test.ts) : `POST /auth/sign-in` est limite a 10/minute, et se
// reconnecter a chaque `it` epuiserait vite ce quota. Chaque test cree en revanche son PROPRE
// patient (et ses propres sous-dossiers), pour rester independant des autres sans avoir besoin
// de truncateAll entre eux.
describe('sous-dossier de service : signal de suivi ailleurs', () => {
  let t: TestApp
  let est: { id: string }
  let serviceA: { id: string }
  let serviceB: { id: string }
  let cookiesA: Cookies
  let cookiesB: Cookies
  let secretariatCookies: Cookies
  let est1: { id: string }
  let serviceA1: { id: string }
  let cookies1: Cookies
  let est2: { id: string }
  let serviceB2: { id: string }
  let serviceC2: { id: string }

  beforeAll(async () => {
    await truncateAll()
    t = await buildTestApp()

    const scenario = await twoServicesScenario(t.app)
    est = scenario.est
    serviceA = scenario.serviceA
    serviceB = scenario.serviceB
    cookiesA = scenario.cookiesA
    cookiesB = scenario.cookiesB

    await createUser({
      email: 'secretariat-signal@test.fr',
      memberships: [{ establishmentId: est.id, services: [{ serviceId: serviceA.id, role: 'SECRETARIAT' }] }],
    })
    secretariatCookies = await signIn(t.app, 'secretariat-signal@test.fr')

    // Un second etablissement, pour le cas de l'homonyme (instruction 1 de la tache 7).
    est1 = await createEstablishment('Etablissement homonyme 1')
    serviceA1 = await createService(est1.id, 'A1')
    await createUser({
      email: 'u1-homonyme@test.fr',
      memberships: [{ establishmentId: est1.id, services: [{ serviceId: serviceA1.id, role: 'COORDINATEUR' }] }],
    })
    cookies1 = await signIn(t.app, 'u1-homonyme@test.fr')

    est2 = await createEstablishment('Etablissement homonyme 2')
    serviceB2 = await createService(est2.id, 'B2')
    serviceC2 = await createService(est2.id, 'C2')
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  it('rend vrai quand un sous-dossier existe dans un autre service du meme etablissement — et c est reciproque', async () => {
    const patient = await testDb.patient.create({
      data: { firstName: 'Deux', lastName: 'Services', createDate: new Date(), establishmentId: est.id },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceA.id, establishmentId: est.id },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceB.id, establishmentId: est.id },
    })

    const fromA = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, servicePath(patient.id)), cookies: cookiesA,
    })
    const fromB = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceB.id, servicePath(patient.id)), cookies: cookiesB,
    })
    expect(fromA.statusCode).toBe(200)
    expect(fromB.statusCode).toBe(200)
    expect(fromA.json().followedElsewhere).toBe(true)
    expect(fromB.json().followedElsewhere).toBe(true)
  })

  it('rend faux quand aucun autre sous-dossier n existe', async () => {
    const patient = await testDb.patient.create({
      data: { firstName: 'Seul', lastName: 'Service', createDate: new Date(), establishmentId: est.id },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceA.id, establishmentId: est.id },
    })

    const res = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, servicePath(patient.id)), cookies: cookiesA,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().followedElsewhere).toBe(false)
  })

  // Instruction 1 (dispatch tache 7) : un patient HOMONYME dans un AUTRE etablissement ne doit
  // jamais faire passer le signal a vrai. `runAsSystem` retire l'exigence du garde-fou — sans
  // filtre explicite d'etablissement dans la requete, elle pourrait lire N'IMPORTE QUEL
  // etablissement. Ce cas eprouve exactement ca : un homonyme, suivi dans DEUX services d'un
  // AUTRE etablissement (donc lui-meme "suivi ailleurs" dans SON etablissement), ne doit rien
  // changer au signal du premier patient.
  it('rend faux quand le seul autre sous-dossier appartient a un patient homonyme d un autre etablissement', async () => {
    const patient1 = await testDb.patient.create({
      data: { firstName: 'Jean', lastName: 'Dupont', createDate: new Date(), establishmentId: est1.id },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patient1.id, serviceId: serviceA1.id, establishmentId: est1.id },
    })

    // L'homonyme : meme prenom, meme nom, mais un identifiant distinct dans un AUTRE
    // etablissement, suivi dans DEUX de ses services (vrai suivi-ailleurs, mais le sien).
    const patientHomonyme = await testDb.patient.create({
      data: { firstName: 'Jean', lastName: 'Dupont', createDate: new Date(), establishmentId: est2.id },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patientHomonyme.id, serviceId: serviceB2.id, establishmentId: est2.id },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patientHomonyme.id, serviceId: serviceC2.id, establishmentId: est2.id },
    })

    const res = await t.app.inject({
      method: 'GET', url: tenantUrl(est1.id, serviceA1.id, servicePath(patient1.id)), cookies: cookies1,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().followedElsewhere).toBe(false)
  })

  // Instruction 3 : la reponse ne rend qu un booleen et rien de plus. On verifie ici que
  // l ensemble des cles de la reponse HTTP REELLE est exactement celui declare par le schema
  // (id, patientId, serviceId, establishmentId, createdAt, les seize champs, followedElsewhere)
  // — ni le nom, ni le compte, ni la date, ni le contenu de l AUTRE sous-dossier qui a fait
  // passer le signal a vrai.
  it('ne rend qu un booleen dans la reponse HTTP — aucune cle supplementaire, meme quand le signal est vrai', async () => {
    const patient = await testDb.patient.create({
      data: { firstName: 'Fuite', lastName: 'Zero', createDate: new Date(), establishmentId: est.id },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceA.id, establishmentId: est.id },
    })
    await testDb.patientServiceFile.create({
      data: {
        patientId: patient.id,
        serviceId: serviceB.id,
        establishmentId: est.id,
        notes: 'CONTENU-SECRET-DE-B',
        referringCaregiver: 'Soignant Secret',
      },
    })

    const res = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, servicePath(patient.id)), cookies: cookiesA,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.followedElsewhere).toBe(true)
    expect(typeof body.followedElsewhere).toBe('boolean')

    const clesAttendues = Object.keys(patientServiceFileResponseSchema.shape).sort()
    expect(Object.keys(body).sort()).toEqual(clesAttendues)

    // Rien du contenu de B ne fuit dans la reponse de A.
    const brute = JSON.stringify(body)
    expect(brute).not.toContain('CONTENU-SECRET-DE-B')
    expect(brute).not.toContain('Soignant Secret')
    expect(brute).not.toContain(serviceB.id)
  })

  it('le secretariat voit le signal comme les autres roles, alors qu il ne voit pas les trois champs cliniques', async () => {
    const patient = await testDb.patient.create({
      data: { firstName: 'Clinique', lastName: 'Test', createDate: new Date(), establishmentId: est.id },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceA.id, establishmentId: est.id, notes: 'SECRET' },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceB.id, establishmentId: est.id },
    })

    const asSecretariat = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, servicePath(patient.id)), cookies: secretariatCookies,
    })
    const asCoordinateur = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, servicePath(patient.id)), cookies: cookiesA,
    })

    expect(asSecretariat.statusCode).toBe(200)
    expect(asCoordinateur.statusCode).toBe(200)
    // Le champ n est pas clinique (absent d utils/clinical-fields.ts) : le secretariat le voit,
    // identique au coordinateur.
    expect(asSecretariat.json().followedElsewhere).toBe(true)
    expect(asSecretariat.json().followedElsewhere).toBe(asCoordinateur.json().followedElsewhere)
    // Contre-epreuve : les trois champs cliniques, eux, restent masques au secretariat — la
    // difference n est donc pas "le secretariat voit tout", mais bien un traitement distinct et
    // correct par champ.
    expect(asSecretariat.json()).not.toHaveProperty('notes')
    expect(asSecretariat.json()).not.toHaveProperty('details')
    expect(asSecretariat.json()).not.toHaveProperty('medicalDiagnosis')
    expect(asCoordinateur.json().notes).toBe('SECRET')
  })

  // Instruction 4 : deux services, un meme patient, chacun ne lit que son propre sous-dossier —
  // et l autre recoit 404, jamais un sous-dossier vide (un objet vide et une absence ne se
  // distinguent pas cote appelant). Deja couvert par une entree dediee de
  // back/src/test/e2e/isolation.test.ts (tache 6) ; repris ici au plus pres du signal, pour
  // montrer que brancher `followedElsewhere` sur la route n a pas fait glisser le 404 vers un
  // corps partiel qui ne porterait que le booleen.
  it('un service sans sous-dossier local recoit 404, meme si le signal serait vrai', async () => {
    const patient = await testDb.patient.create({
      data: { firstName: 'Cloisonne', lastName: 'Ment', createDate: new Date(), establishmentId: est.id },
    })
    // Sous-dossier seulement dans B : A n en a aucun.
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceB.id, establishmentId: est.id, notes: 'SECRET-B-CLOISON' },
    })

    const fromA = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, servicePath(patient.id)), cookies: cookiesA,
    })
    expect(fromA.statusCode).toBe(404)
    // Jamais un objet partiel qui ne porterait que le booleen : le corps du 404 est celui,
    // neutre, declare par la route (`{ message }`), rien qui ressemble a un sous-dossier.
    expect(fromA.json()).not.toHaveProperty('followedElsewhere')
    expect(fromA.json()).not.toHaveProperty('id')
    expect(fromA.json()).not.toHaveProperty('notes')

    const fromB = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceB.id, servicePath(patient.id)), cookies: cookiesB,
    })
    expect(fromB.statusCode).toBe(200)
    expect(fromB.json().notes).toBe('SECRET-B-CLOISON')
  })

  // Instruction 6 (dispatch tache 7) : la revue de la tache 5 a etabli qu un diagnostic cree
  // dans le mauvais service laisse une trace permanente — `ensureExists` pose un sous-dossier
  // VIDE avant l ecriture de l enfant, et rien ne le retire quand l enfant est ensuite supprime
  // (repository.ts, commentaire au-dessus de `ensureExists`). Ce test montre l interaction avec
  // le signal, sans la corriger : un sous-dossier cree par erreur, meme laisse vide apres coup,
  // fait passer `estSuiviAilleurs` a vrai pour l AUTRE service — exactement comme le ferait un
  // vrai suivi. C est une consequence directe et voulue de la definition du signal ("a-t-il AU
  // MOINS un sous-dossier ailleurs") : elle n est pas corrigee ici, elle est documentee. Voir le
  // rapport de la tache 7 pour la conclusion.
  it('un diagnostic cree puis supprime dans le mauvais service laisse un sous-dossier vide qui fait passer le signal a vrai', async () => {
    const patient = await testDb.patient.create({
      data: { firstName: 'Erreur', lastName: 'DeService', createDate: new Date(), establishmentId: est.id },
    })

    // La bevue : un diagnostic cree dans B alors qu il aurait du l etre dans A.
    const created = await t.app.inject({
      method: 'POST',
      url: tenantUrl(est.id, serviceB.id, `/patient/${patient.id}/diagnostic`),
      cookies: cookiesB,
      payload: { title: 'Oups, mauvais service', activeFields: [] },
    })
    expect(created.statusCode).toBe(201)
    const diagnosticId = created.json().id

    // Le correctif humain habituel : on supprime le diagnostic errone...
    const deleted = await t.app.inject({
      method: 'DELETE',
      url: tenantUrl(est.id, serviceB.id, `/patient/${patient.id}/diagnostic/${diagnosticId}`),
      cookies: cookiesB,
    })
    expect(deleted.statusCode).toBe(204)

    // ...mais le sous-dossier que `ensureExists` avait pose dans B pour accueillir ce
    // diagnostic, lui, reste — vide, mais present.
    const traceDansB = await testDb.patientServiceFile.findUnique({
      where: { patientId_serviceId: { patientId: patient.id, serviceId: serviceB.id } },
    })
    expect(traceDansB).not.toBeNull()
    expect(traceDansB?.notes).toBeNull()

    // Le service A cree ENSUITE, correctement, son propre sous-dossier (necessaire pour lire le
    // sien : un 404 ne porterait pas le signal, voir le cas de cloisonnement ci-dessus).
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceA.id, establishmentId: est.id },
    })

    const fromA = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, servicePath(patient.id)), cookies: cookiesA,
    })
    expect(fromA.statusCode).toBe(200)
    // Comportement actuel, constate et non corrige par cette tache : la trace vide suffit a
    // faire croire a A qu il existe un vrai suivi ailleurs.
    expect(fromA.json().followedElsewhere).toBe(true)
  })
})
