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

// Le signal de suivi ailleurs (design §5.3/§6, tache 7 ; condition d'apparition corrigee a la
// tache 13, tour de correction 1, point 1 — Critique C1 ; voir D3, decisions-etape-3.md) :
// une lecture qui traverse volontairement la frontiere entre services (`impactDesactivation`,
// tache 9, en est une autre — voir patientServiceFile.repository.ts pour pourquoi ce n'est PAS
// le meme calcul : le signal ci-dessous reste vrai meme si l'ailleurs est un service desactive,
// puisque le sous-dossier existe et que ce service peut etre reactive). Ce fichier prouve, par
// requete HTTP reelle et non par relecture du code, que :
//   1. le champ se comporte correctement dans les TROIS cas : suivi ici ET ailleurs (present,
//      vrai) ; suivi ici seulement (present, faux) ; PAS suivi ici (absent de la reponse, quel
//      que soit le suivi ailleurs) ;
//   2. il ne fuit jamais rien d'autre, dans la reponse comme aux yeux du filtrage clinique ;
//   3. le cloisonnement existant (un service ne lit jamais le sous-dossier d'un autre : 404,
//      jamais un objet vide) tient toujours une fois le signal branche sur la route.
//
// Tour de correction 1 de la tache 7 (constat I1) avait deplace le signal de
// `GET .../service-file` vers `GET /patient/:id`, en le rendant disponible AVANT qu'aucun
// sous-dossier local n'existe — precisement ce que la decision 2.1 demandait pour un second
// service qui ACCUEILLE un patient deja suivi ailleurs.
//
// La tache 13 a ensuite arme un chemin qui rend cette disponibilite inconditionnelle
// dangereuse : `GET /patient/search` (ouverte a `patient:read`, donc a LECTURE) rend un `id`
// pour un patient que le demandeur ne suit pas du tout, et cet `id` suffisait a lire le signal
// en une seconde requete, sans aucune ecriture — exactement ce que la spec §6 interdit
// ("trouver quelqu'un ne revele que son identite, jamais son suivi"). Tour de correction 1 de la
// tache 13 (C1) : le signal est desormais ABSENT de la reponse tant que le service courant n'a
// pas SON PROPRE sous-dossier pour ce patient — jamais `false` dans ce cas, un `false` dirait
// "je sais, et c'est non". Depuis la tache 12, tout patient cree ou rattache dans un service y
// possede un sous-dossier (`ensureExists`), donc cette condition recouvre exactement "ce patient
// est chez moi" : la decision 2.1 reste servie normalement des qu'un service ACCUEILLE
// reellement un patient (il pose alors son propre sous-dossier vide au meme moment — voir
// `attachToCurrentService`/`PatientDomain.create`) ; seule la lecture PURE (chercher, sans
// accueillir) ne voit plus rien. `servicePath` (le sous-dossier) reste utilise ici pour les
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

  // Les trois cas exiges par la revue (tache 13, tour de correction 1, point 1) : suivi ici ET
  // ailleurs (present, vrai) ; suivi ici SEULEMENT (present, faux) ; PAS suivi ici (absent),
  // regroupes dans un seul test pour partager le meme patient et la meme lecture croisee.
  it(
    'les trois cas du signal : present et vrai (suivi ici et ailleurs), present et faux (suivi ' +
      'ici seulement), absent (pas suivi ici, quel que soit le suivi ailleurs)',
    async () => {
      const patient = await testDb.patient.create({
        data: { firstName: 'Deux', lastName: 'Services', createDate: new Date(), establishmentId: est.id },
      })
      await testDb.patientServiceFile.create({
        data: { patientId: patient.id, serviceId: serviceA.id, establishmentId: est.id },
      })
      await testDb.patientServiceFile.create({
        data: { patientId: patient.id, serviceId: serviceB.id, establishmentId: est.id },
      })

      // Cas 1 : sous-dossier ICI (A) et ailleurs (B) -> present, vrai. Reciproque : vu de B
      // aussi (B a son propre sous-dossier, et voit celui de A comme "ailleurs").
      const fromA = await t.app.inject({
        method: 'GET', url: tenantUrl(est.id, serviceA.id, identityPath(patient.id)), cookies: cookiesA,
      })
      const fromB = await t.app.inject({
        method: 'GET', url: tenantUrl(est.id, serviceB.id, identityPath(patient.id)), cookies: cookiesB,
      })
      expect(fromA.statusCode).toBe(200)
      expect(fromB.statusCode).toBe(200)
      expect(fromA.json()).toHaveProperty('followedElsewhere', true)
      expect(fromB.json()).toHaveProperty('followedElsewhere', true)

      // Cas 2 : sous-dossier ICI seulement (patient suivi uniquement en A) -> present, faux.
      const patientSeul = await testDb.patient.create({
        data: { firstName: 'Seul', lastName: 'Service', createDate: new Date(), establishmentId: est.id },
      })
      await testDb.patientServiceFile.create({
        data: { patientId: patientSeul.id, serviceId: serviceA.id, establishmentId: est.id },
      })
      const resSeul = await t.app.inject({
        method: 'GET', url: tenantUrl(est.id, serviceA.id, identityPath(patientSeul.id)), cookies: cookiesA,
      })
      expect(resSeul.statusCode).toBe(200)
      expect(resSeul.json()).toHaveProperty('followedElsewhere', false)

      // Cas 3 : PAS de sous-dossier ICI (B ne suit pas ce patient), alors qu'il en existe un
      // ailleurs (A) — c'est exactement le cas d'une simple recherche (GET /patient/search rend
      // un `id`, puis GET /patient/:id) : le champ doit etre ABSENT, jamais `false`.
      const resPasIci = await t.app.inject({
        method: 'GET', url: tenantUrl(est.id, serviceB.id, identityPath(patientSeul.id)), cookies: cookiesB,
      })
      expect(resPasIci.statusCode).toBe(200)
      expect(resPasIci.json()).not.toHaveProperty('followedElsewhere')

      await testDb.patient.delete({ where: { id: patientSeul.id } })
    },
  )

  // Tache 12, tour de correction 1, point 3 : `PatientDomain.create` appelle desormais
  // `ensureExists` (voir le commentaire au-dessus de l'appel, dans patient.domain.ts), pour
  // qu'un patient cree sans parcours ait un sous-dossier dans le service qui vient de le creer.
  //
  // Consequence, mise a jour au tour de correction 1 de la tache 13 (C1) : un patient cree dans
  // le service A (POST /patient seul, aucune inscription) fait-il passer le signal a vrai pour
  // le service B ? PLUS AUTOMATIQUEMENT — B doit d'abord accueillir (rattacher) ce patient pour
  // que le signal lui apparaisse ; une simple lecture depuis B, sans sous-dossier local, ne le
  // voit plus (cas 3 ci-dessus). Ce test montre les deux temps : absent avant que B n'accueille
  // le patient, present et vrai des qu'il le fait.
  it(
    'un patient cree sans parcours dans le service A : absent pour B tant qu il ne l accueille ' +
      'pas, present et vrai des qu il le rattache',
    async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: tenantUrl(est.id, serviceA.id, '/patient'),
        cookies: cookiesA,
        payload: { firstName: 'CreeSeul', lastName: 'ServiceA' },
      })
      expect(created.statusCode).toBe(201)
      const patientId = created.json().id as string

      const fromBAvant = await t.app.inject({
        method: 'GET', url: tenantUrl(est.id, serviceB.id, identityPath(patientId)), cookies: cookiesB,
      })
      expect(fromBAvant.statusCode).toBe(200)
      expect(fromBAvant.json()).not.toHaveProperty('followedElsewhere')

      const attach = await t.app.inject({
        method: 'POST',
        url: tenantUrl(est.id, serviceB.id, servicePath(patientId)),
        cookies: cookiesB,
      })
      expect(attach.statusCode).toBe(200)

      const fromBApres = await t.app.inject({
        method: 'GET', url: tenantUrl(est.id, serviceB.id, identityPath(patientId)), cookies: cookiesB,
      })
      expect(fromBApres.statusCode).toBe(200)
      expect(fromBApres.json()).toHaveProperty('followedElsewhere', true)

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
    // patient1 a son propre sous-dossier ici (serviceA1) : le champ est present (le service
    // demandeur suit ce patient), et vaut faux (l'homonyme ne compte pas).
    expect(res.json()).toHaveProperty('followedElsewhere', false)
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
  // Tour 1 de la tache 7 (I1) avait rendu le signal disponible sans sous-dossier local. Tour 1
  // de la tache 13 (C1) referme ce cas precis : un service SANS sous-dossier local, qui n a rien
  // accueilli, ne voit PLUS le signal (absent, pas faux) — voir l en-tete de ce fichier. Ce test
  // le montre desormais dans les DEUX sens : le 404 du sous-dossier ne porte toujours rien
  // (inchange), et la lecture du PATIENT, elle, n a plus le champ tant que A n a pas accueilli le
  // patient ; des qu il le fait (rattachement), le champ apparait et vaut vrai.
  it(
    'un service sans sous-dossier local recoit 404 sur le sous-dossier ET aucun signal sur la ' +
      'fiche patient — jusqu a ce qu il accueille le patient',
    async () => {
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

      // A n a RIEN ecrit pour ce patient (ni cree, ni rattache) : c est exactement le cas d une
      // simple recherche qui aurait trouve son `id` — le signal doit rester absent.
      const identiteDepuisA = await t.app.inject({
        method: 'GET', url: tenantUrl(est.id, serviceA.id, identityPath(patient.id)), cookies: cookiesA,
      })
      expect(identiteDepuisA.statusCode).toBe(200)
      expect(identiteDepuisA.json()).not.toHaveProperty('followedElsewhere')

      // Le second service ACCUEILLE maintenant ce patient (rattachement) : c est exactement le
      // moment ou la decision 2.1 dit que l ecran doit indiquer un suivi ailleurs, pour que le
      // soignant se rapproche d un collegue plutot que de croire decouvrir un dossier neuf.
      const attach = await t.app.inject({
        method: 'POST', url: tenantUrl(est.id, serviceA.id, servicePath(patient.id)), cookies: cookiesA,
      })
      expect(attach.statusCode).toBe(200)

      const identiteApresAccueil = await t.app.inject({
        method: 'GET', url: tenantUrl(est.id, serviceA.id, identityPath(patient.id)), cookies: cookiesA,
      })
      expect(identiteApresAccueil.statusCode).toBe(200)
      expect(identiteApresAccueil.json()).toHaveProperty('followedElsewhere', true)

      const sousDossierDepuisB = await t.app.inject({
        method: 'GET', url: tenantUrl(est.id, serviceB.id, servicePath(patient.id)), cookies: cookiesB,
      })
      expect(sousDossierDepuisB.statusCode).toBe(200)
      expect(sousDossierDepuisB.json().notes).toBe('SECRET-B-CLOISON')
    },
  )

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

    // Le service A cree ENSUITE, correctement, son propre sous-dossier — necessaire depuis le
    // tour 1 de la tache 13 (C1) pour que le signal lui apparaisse du tout (voir l en-tete de ce
    // fichier) : sans cette ligne, la lecture ci-dessous n aurait plus le champ.
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceA.id, establishmentId: est.id },
    })

    const fromA = await t.app.inject({
      method: 'GET', url: tenantUrl(est.id, serviceA.id, identityPath(patient.id)), cookies: cookiesA,
    })
    expect(fromA.statusCode).toBe(200)
    // Comportement actuel, constate et non corrige par cette tache : la trace vide suffit a
    // faire croire a A qu il existe un vrai suivi ailleurs, et rien dans l API ne peut l eteindre.
    expect(fromA.json()).toHaveProperty('followedElsewhere', true)
  })
})
