import { patientDetailResponseSchema } from '../../main/interfaces/http/fastify/schemas/patient.schema'
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
// Le signal vit sur la lecture du patient (spec §6, "bloc d'identite"), pas sur celle du
// sous-dossier de service — voir l'en-tete plus bas (revue tache 7, tour 1, I1).
const identityPath = (patientId: string) => `/patient/${patientId}`

// Le signal de suivi ailleurs (design §5.3/§6, tache 7) : LA SEULE lecture de tout le back qui
// traverse volontairement la frontiere entre services. Ce fichier prouve, par requete HTTP
// reelle et non par relecture du code, que :
//   1. le booleen se comporte correctement (vrai / faux / faux a travers un etablissement) ;
//   2. il ne fuit jamais rien d'autre, dans la reponse comme aux yeux du filtrage clinique ;
//   3. le cloisonnement existant (un service ne lit jamais le sous-dossier d'un autre : 404,
//      jamais un objet vide) tient toujours une fois le signal branche sur la route.
//
// Tour de correction 1 (revue de la tache 7, constat I1) : le signal vivait a l'origine sur
// `GET .../service-file`, donc indisponible tant que le service courant n'a pas encore de
// sous-dossier local — exactement le moment ou la decision 2.1 le rend le plus utile (un second
// service qui accueille un patient deja suivi ailleurs part d'un sous-dossier vide). Il vit
// desormais sur `GET /patient/:id` (le bloc d'identite, spec §6), disponible avant qu'aucun
// sous-dossier de service n'existe. `servicePath` (le sous-dossier) reste utilise ici pour les
// tests qui portent sur le CLOISONNEMENT du sous-dossier lui-meme (le 404, la trace vide laissee
// par `ensureExists`), independants du signal.
//
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
describe('signal de suivi ailleurs (lecture du patient)', () => {
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
      method: 'GET', url: tenantUrl(est.id, serviceA.id, identityPath(patient.id)), cookies: cookiesA,
    })
    const fromB = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceB.id, identityPath(patient.id)), cookies: cookiesB,
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
      method: 'GET', url: tenantUrl(est.id, serviceA.id, identityPath(patient.id)), cookies: cookiesA,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().followedElsewhere).toBe(false)
  })

  // Tache 12, tour de correction 1, point 3 : `PatientDomain.create` appelle desormais
  // `ensureExists` (voir le commentaire au-dessus de l'appel, dans patient.domain.ts), pour
  // qu'un patient cree sans parcours ait un sous-dossier dans le service qui vient de le creer.
  // Consequence a etablir par un test et non a supposer : un patient cree dans le service A
  // (POST /patient seul, aucune inscription) fait-il passer le signal a vrai pour le service B ?
  // Reponse : oui — et c'est la meme consequence, deja acceptee, qu'un diagnostic cree dans le
  // mauvais service (voir le test plus bas, "un diagnostic cree puis supprime..."). C'est
  // conforme a la definition du signal telle que la spec §5.3 la pose ("ce patient a-t-il AU
  // MOINS un sous-dossier dans un autre service") : le signal ne distingue pas un sous-dossier
  // ouvert par une creation directe d'un sous-dossier ouvert par une inscription ou un
  // diagnostic — il n'y a qu'une seule notion de sous-dossier, et la spec ne prevoit aucune
  // exception pour celui laisse par une creation seule.
  it('un patient cree sans parcours dans le service A fait passer le signal a vrai pour le service B', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: tenantUrl(est.id, serviceA.id, '/patient'),
      cookies: cookiesA,
      payload: { firstName: 'CreeSeul', lastName: 'ServiceA' },
    })
    expect(created.statusCode).toBe(201)
    const patientId = created.json().id as string

    const fromB = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceB.id, identityPath(patientId)), cookies: cookiesB,
    })
    expect(fromB.statusCode).toBe(200)
    expect(fromB.json().followedElsewhere).toBe(true)

    await testDb.patient.delete({ where: { id: patientId } })
  })

  // Instruction 1 (dispatch tache 7) : un patient HOMONYME dans un AUTRE etablissement ne doit
  // jamais faire passer le signal a vrai.
  //
  // Correction (tour 1, I2) : ce que ce cas prouve REELLEMENT, etabli par execution en retirant
  // le filtre d'etablissement de la requete (`estSuiviAilleurs`) et en rejouant les 101 e2e —
  // elles restent toutes vertes, celui-ci compris. Le cas ne tombe QUE si on retire ou affaiblit
  // le filtre `serviceId: { not }` (raison B2/B3/B4 dans le releve de la revue), jamais pour la
  // raison `establishmentId` : le seul patient qu'il pose dans un AUTRE etablissement (est2) est
  // suivi dans DEUX services de CET etablissement-la, pas dans un service de `est1`, donc il ne
  // distingue meme pas un filtre d'etablissement present d'un filtre d'etablissement absent — les
  // deux le laissent hors de portee. Ce que ce cas prouve reellement : un homonyme d'un autre
  // etablissement n'entre pas dans le resultat par coincidence de nom, seulement par
  // coincidence d'identifiant — ce qui serait vrai meme sans le filtre `establishmentId`. La
  // borne d'etablissement ELLE-MEME n'est eprouvee, en comportement, que par une base ou un
  // `patientId` porterait reellement deux `establishmentId` differents — voir le commentaire de
  // `estSuiviAilleurs` (patientServiceFile.repository.ts) pour comment cette borne a ete eprouvee
  // (cles etrangeres retirees, ligne impossible inseree) et pourquoi elle reste necessaire meme
  // si ce cas-ci ne peut pas la faire rougir.
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
      method: 'GET', url: tenantUrl(est1.id, serviceA1.id, identityPath(patient1.id)), cookies: cookies1,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().followedElsewhere).toBe(false)
  })

  // Instruction 3 : la reponse ne rend qu un booleen de plus, rien d'autre du sous-dossier d un
  // AUTRE service. On verifie ici que l ensemble des cles de la reponse HTTP REELLE est
  // exactement celui declare par le schema du DETAIL patient (identite + followedElsewhere) — ni
  // le nom, ni le compte, ni la date, ni le contenu de l AUTRE sous-dossier qui a fait passer le
  // signal a vrai.
  it('ne rend qu un booleen de plus dans la reponse HTTP — aucune cle supplementaire, meme quand le signal est vrai', async () => {
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
      method: 'GET', url: tenantUrl(est.id, serviceA.id, identityPath(patient.id)), cookies: cookiesA,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.followedElsewhere).toBe(true)
    expect(typeof body.followedElsewhere).toBe('boolean')

    const clesAttendues = Object.keys(patientDetailResponseSchema.shape).sort()
    expect(Object.keys(body).sort()).toEqual(clesAttendues)

    // Rien du contenu de B ne fuit dans la reponse de A.
    const brute = JSON.stringify(body)
    expect(brute).not.toContain('CONTENU-SECRET-DE-B')
    expect(brute).not.toContain('Soignant Secret')
    expect(brute).not.toContain(serviceB.id)
  })

  it('le secretariat voit le signal comme les autres roles, alors qu il ne voit pas les trois champs cliniques du sous-dossier', async () => {
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
      method: 'GET', url: tenantUrl(est.id, serviceA.id, identityPath(patient.id)), cookies: secretariatCookies,
    })
    const asCoordinateur = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, identityPath(patient.id)), cookies: cookiesA,
    })

    expect(asSecretariat.statusCode).toBe(200)
    expect(asCoordinateur.statusCode).toBe(200)
    // Le champ n est pas clinique (absent d utils/clinical-fields.ts) : le secretariat le voit,
    // identique au coordinateur.
    expect(asSecretariat.json().followedElsewhere).toBe(true)
    expect(asSecretariat.json().followedElsewhere).toBe(asCoordinateur.json().followedElsewhere)

    // Contre-epreuve : les trois champs cliniques du SOUS-DOSSIER, eux, restent masques au
    // secretariat — la difference n est donc pas "le secretariat voit tout", mais bien un
    // traitement distinct et correct par champ. Verifie sur la route du sous-dossier, la seule
    // qui les porte desormais (deplacement I1) ; le coordinateur, lui, les lit.
    const sousDossierSecretariat = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, servicePath(patient.id)), cookies: secretariatCookies,
    })
    const sousDossierCoordinateur = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, servicePath(patient.id)), cookies: cookiesA,
    })
    expect(sousDossierSecretariat.json()).not.toHaveProperty('notes')
    expect(sousDossierSecretariat.json()).not.toHaveProperty('details')
    expect(sousDossierSecretariat.json()).not.toHaveProperty('medicalDiagnosis')
    expect(sousDossierCoordinateur.json().notes).toBe('SECRET')
  })

  // Instruction 4 : deux services, un meme patient, chacun ne lit que son propre sous-dossier —
  // et l autre recoit 404 sur la route du SOUS-DOSSIER, jamais un objet vide (un objet vide et
  // une absence ne se distinguent pas cote appelant). Deja couvert par une entree dediee de
  // back/src/test/e2e/isolation.test.ts (tache 6) ; repris ici au plus pres du signal.
  //
  // Tour 1 (I1) : le signal, lui, ne depend plus de l existence d un sous-dossier local — c est
  // precisement le defaut que ce tour corrige. Ce test le montre desormais dans les DEUX sens :
  // le 404 du sous-dossier ne porte toujours rien (inchangé), et la lecture du PATIENT, elle,
  // rend le signal vrai malgre l absence de sous-dossier local — le cas que la decision 2.1
  // decrit (un second service qui accueille un patient deja suivi ailleurs, avant d avoir ecrit
  // quoi que ce soit).
  it('un service sans sous-dossier local recoit 404 sur le sous-dossier, mais voit deja le signal sur la fiche patient', async () => {
    const patient = await testDb.patient.create({
      data: { firstName: 'Cloisonne', lastName: 'Ment', createDate: new Date(), establishmentId: est.id },
    })
    // Sous-dossier seulement dans B : A n en a aucun.
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceB.id, establishmentId: est.id, notes: 'SECRET-B-CLOISON' },
    })

    const sousDossierDepuisA = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, servicePath(patient.id)), cookies: cookiesA,
    })
    expect(sousDossierDepuisA.statusCode).toBe(404)
    // Jamais un objet partiel : le corps du 404 est celui, neutre, declare par la route
    // (`{ message }`), rien qui ressemble a un sous-dossier.
    expect(sousDossierDepuisA.json()).not.toHaveProperty('id')
    expect(sousDossierDepuisA.json()).not.toHaveProperty('notes')

    // Le second service PREND EN CHARGE ce patient sans avoir encore rien ecrit : c est
    // exactement le moment ou la decision 2.1 dit que l ecran doit deja indiquer un suivi
    // ailleurs, pour que le soignant se rapproche d un collegue plutot que de croire decouvrir un
    // dossier neuf.
    const identiteDepuisA = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, identityPath(patient.id)), cookies: cookiesA,
    })
    expect(identiteDepuisA.statusCode).toBe(200)
    expect(identiteDepuisA.json().followedElsewhere).toBe(true)

    const sousDossierDepuisB = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceB.id, servicePath(patient.id)), cookies: cookiesB,
    })
    expect(sousDossierDepuisB.statusCode).toBe(200)
    expect(sousDossierDepuisB.json().notes).toBe('SECRET-B-CLOISON')
  })

  // Instruction 6 (dispatch tache 7) : la revue de la tache 5 a etabli qu un diagnostic cree
  // dans le mauvais service laisse une trace permanente — `ensureExists` pose un sous-dossier
  // VIDE avant l ecriture de l enfant, et rien ne le retire quand l enfant est ensuite supprime
  // (repository.ts, commentaire au-dessus de `ensureExists`). Ce test montre l interaction avec
  // le signal, sans la corriger : un sous-dossier cree par erreur, meme laisse vide apres coup,
  // fait passer `estSuiviAilleurs` a vrai pour l AUTRE service — exactement comme le ferait un
  // vrai suivi. C est une consequence directe et voulue de la definition du signal ("a-t-il AU
  // MOINS un sous-dossier ailleurs") : elle n est pas corrigee ici, elle est documentee.
  //
  // Correction (tour 1, I4) : et cette trace est SANS REMEDE par l API. Aucune route de tout le
  // back ne supprime un sous-dossier de service (`patientServiceFileRouter` ne declare que GET
  // et PATCH ; le depot n expose que `findByPatient`, `upsert`, `ensureExists`,
  // `estSuiviAilleurs`) : la seule disparition possible est la cascade depuis la suppression du
  // PATIENT lui-meme. Le correctif humain habituel — supprimer le diagnostic errone — ne
  // l eteint donc pas : une fois la bevue commise, le signal reste allume pour tous les autres
  // services de l etablissement jusqu a ce que le patient soit supprime.
  it('un diagnostic cree puis supprime dans le mauvais service laisse un sous-dossier vide, dont le signal ne peut plus etre eteint par l API', async () => {
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
    // diagnostic, lui, reste — vide, mais present. Aucune route ne peut plus le retirer : voir le
    // commentaire d en-tete de ce test.
    const traceDansB = await testDb.patientServiceFile.findUnique({
      where: { patientId_serviceId: { patientId: patient.id, serviceId: serviceB.id } },
    })
    expect(traceDansB).not.toBeNull()
    expect(traceDansB?.notes).toBeNull()

    // Le service A cree ENSUITE, correctement, son propre sous-dossier (necessaire pour lire le
    // sien : depuis le tour 1 (I1), le signal ne l exige plus pour APPARAITRE sur la fiche
    // patient, mais ce test verifie ici l ecriture normale du sous-dossier, pas seulement le
    // signal).
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceA.id, establishmentId: est.id },
    })

    const fromA = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, identityPath(patient.id)), cookies: cookiesA,
    })
    expect(fromA.statusCode).toBe(200)
    // Comportement actuel, constate et non corrige par cette tache : la trace vide suffit a
    // faire croire a A qu il existe un vrai suivi ailleurs, et rien dans l API ne peut l eteindre.
    expect(fromA.json().followedElsewhere).toBe(true)
  })
})
