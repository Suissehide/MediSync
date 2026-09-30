// Avant de creer un patient, l'ecran cherche une identite
// existante dans l'etablissement, pour eviter les doublons (spec §6). La propriete centrale :
// la recherche ne doit JAMAIS rendre autre chose que
// l'identite — nom, prenom, date de naissance — meme quand le patient trouve a un dossier riche
// dans un AUTRE service. Ce fichier prouve cette propriete par execution, champ par champ, avant
// de prouver le reste du flux (cloisonnement d'etablissement, parite secretariat, et le
// rattachement d'une identite existante au service courant).
//
// Ce fichier verifie aussi, en execution reelle : la
// reponse est desormais `{ results, hasMore }` (la troncature a vingt n'est plus
// muette) ; `%`/`_` dans un nom cherche sont traites comme du texte, pas des jokers LIKE ;
// et le rattachement en PARALLELE (pas seulement en sequence) est idempotent — aucune
// reponse 409 pour une operation qui reussit.
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

type Cookies = { access_token: string }

describe('recherche d identite existante avant creation de patient', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceAId: string
  let serviceBId: string
  let autreEtablissementId: string
  let autreServiceId: string
  let coordoCookies: Cookies
  let secretariatCookies: Cookies
  let autreEtablissementCookies: Cookies

  const searchFrom = (serviceId: string, cookies: Cookies, query: string) =>
    testApp.app.inject({
      method: 'GET',
      url: tenantUrl(establishmentId, serviceId, `/patient/search${query}`),
      cookies,
    })

  const post = (
    serviceId: string,
    cookies: Cookies,
    url: string,
    payload: unknown,
  ) =>
    testApp.app.inject({
      method: 'POST',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies,
      payload: payload as never,
    })

  const patch = (
    serviceId: string,
    cookies: Cookies,
    url: string,
    payload: unknown,
  ) =>
    testApp.app.inject({
      method: 'PATCH',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies,
      payload: payload as never,
    })

  const get = (serviceId: string, cookies: Cookies, url: string) =>
    testApp.app.inject({
      method: 'GET',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies,
    })

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-identite')
    establishmentId = establishment.id
    const serviceA = await createService(
      establishmentId,
      'Service A - identite',
    )
    const serviceB = await createService(
      establishmentId,
      'Service B - identite',
    )
    serviceAId = serviceA.id
    serviceBId = serviceB.id

    const autre = await createEstablishment('E2-identite')
    autreEtablissementId = autre.id
    const autreService = await createService(
      autreEtablissementId,
      'Service C - autre etablissement',
    )
    autreServiceId = autreService.id

    // COORDINATEUR des deux services de l'etablissement E, pour comparer directement ce que
    // chaque service voit.
    await createUser({
      email: 'coordo@identite.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [
            { serviceId: serviceAId, role: 'COORDINATEUR' },
            { serviceId: serviceBId, role: 'COORDINATEUR' },
          ],
        },
      ],
    })

    // SECRETARIAT du service A : la recherche ne porte aucun champ clinique, elle doit donc
    // rendre exactement la meme chose qu'au coordinateur.
    await createUser({
      email: 'secretariat@identite.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId: serviceAId, role: 'SECRETARIAT' }],
        },
      ],
    })

    await createUser({
      email: 'autre-etablissement@identite.fr',
      memberships: [
        {
          establishmentId: autreEtablissementId,
          role: 'MEMBER',
          services: [{ serviceId: autreServiceId, role: 'COORDINATEUR' }],
        },
      ],
    })

    testApp = await buildTestApp()
    coordoCookies = await signIn(testApp.app, 'coordo@identite.fr')
    secretariatCookies = await signIn(testApp.app, 'secretariat@identite.fr')
    autreEtablissementCookies = await signIn(
      testApp.app,
      'autre-etablissement@identite.fr',
    )
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it(
    "la recherche ne rend que l'identite (id, prenom, nom, date de naissance) — jamais le " +
      'suivi, un service, un contenu clinique ou un compte — meme quand le patient trouve a un ' +
      'dossier riche dans un AUTRE service (design §5.3/§6)',
    async () => {
      // Le patient est cree, et suivi, dans le service A — avec des champs d'identite ET des
      // champs de contact qui ne sont PAS de l'identite au sens de la spec (genre, telephones,
      // email) : la recherche ne doit rendre AUCUN d'entre eux non plus.
      const created = await post(serviceAId, coordoCookies, '/patient', {
        firstName: 'Isabelle',
        lastName: 'Fontaine',
        gender: 'SECRET-GENRE',
        birthDate: '1980-05-12T00:00:00.000Z',
        phone1: 'SECRET-TEL-1',
        phone2: 'SECRET-TEL-2',
        email: 'secret-email@example.fr',
        distance: 'SECRET-DISTANCE',
        educationLevel: 'SECRET-NIVEAU',
        occupation: 'SECRET-PROFESSION',
        currentActivity: 'SECRET-ACTIVITE',
      })
      expect(created.statusCode).toBe(201)
      const patientId = created.json().id as string

      // Dossier riche dans le service A : seize colonnes de service et de contenu clinique.
      // Aucune d'elles ne doit jamais apparaitre dans une reponse de recherche, quel que soit le
      // service qui cherche.
      const richServiceFile = await patch(
        serviceAId,
        coordoCookies,
        `/patient/${patientId}/service-file`,
        {
          medicalDiagnosis: 'SECRET-DIAGNOSTIC-MEDICAL',
          notes: 'SECRET-NOTES-CLINIQUES',
          details: 'SECRET-DETAILS',
          careMode: 'SECRET-MODE-PRISE-EN-CHARGE',
          orientation: 'SECRET-ORIENTATION',
          referringCaregiver: 'SECRET-SOIGNANT-REFERENT',
          stopReason: 'SECRET-MOTIF-ARRET',
        },
      )
      expect(richServiceFile.statusCode).toBe(200)

      // Cherche depuis le service B, qui ne suit PAS ce patient : c'est exactement le cas
      // d'usage vise (eviter un doublon en cherchant dans TOUT l'etablissement).
      const res = await searchFrom(
        serviceBId,
        coordoCookies,
        '?firstName=Isabelle&lastName=Fontaine',
      )
      expect(res.statusCode).toBe(200)

      // `{ results, hasMore }` : pas un tableau nu.
      const body = res.json() as { results: unknown[]; hasMore: boolean }
      expect(body.results).toHaveLength(1)
      expect(body.hasMore).toBe(false)
      const match = body.results[0] as Record<string, unknown>

      // L'assertion la plus importante de ce fichier : EXACTEMENT ces quatre cles, ni plus ni
      // moins. Une seule cle de trop (gender, phone1, followedElsewhere, un nom de service...)
      // fait rougir cette ligne.
      expect(Object.keys(match).sort()).toEqual([
        'birthDate',
        'firstName',
        'id',
        'lastName',
      ])

      expect(match.id).toBe(patientId)
      expect(match.firstName).toBe('Isabelle')
      expect(match.lastName).toBe('Fontaine')
      expect(new Date(match.birthDate as string).toISOString()).toBe(
        '1980-05-12T00:00:00.000Z',
      )

      // Doublure de l'assertion de forme ci-dessus, au niveau du corps brut de la reponse HTTP :
      // aucune des valeurs secretes semees plus haut (contact, clinique, ou le nom d'un service)
      // ne doit apparaitre nulle part dans la reponse — meme pas dans une cle inattendue que
      // `Object.keys` sur `body[0]` n'aurait pas vue si la reponse portait une forme imprevue.
      const rawBody = res.body
      for (const secret of [
        'SECRET-GENRE',
        'SECRET-TEL-1',
        'SECRET-TEL-2',
        'secret-email@example.fr',
        'SECRET-DISTANCE',
        'SECRET-NIVEAU',
        'SECRET-PROFESSION',
        'SECRET-ACTIVITE',
        'SECRET-DIAGNOSTIC-MEDICAL',
        'SECRET-NOTES-CLINIQUES',
        'SECRET-DETAILS',
        'SECRET-MODE-PRISE-EN-CHARGE',
        'SECRET-ORIENTATION',
        'SECRET-SOIGNANT-REFERENT',
        'SECRET-MOTIF-ARRET',
        'Service A - identite',
        'Service B - identite',
        'followedElsewhere',
        'serviceId',
        'establishmentId',
      ]) {
        expect(rawBody).not.toContain(secret)
      }

      await testDb.patient.delete({ where: { id: patientId } })
    },
  )

  it("la recherche ne traverse pas l'etablissement : un patient d'un autre etablissement n'apparait jamais", async () => {
    const created = await post(serviceAId, coordoCookies, '/patient', {
      firstName: 'Gaston',
      lastName: 'Lenoir',
    })
    expect(created.statusCode).toBe(201)
    const patientId = created.json().id as string

    const res = await testApp.app.inject({
      method: 'GET',
      url: tenantUrl(
        autreEtablissementId,
        autreServiceId,
        '/patient/search?firstName=Gaston&lastName=Lenoir',
      ),
      cookies: autreEtablissementCookies,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ results: [], hasMore: false })

    await testDb.patient.delete({ where: { id: patientId } })
  })

  it('un secretariat obtient exactement la meme reponse de recherche qu un coordinateur (aucun champ clinique, aucune permission nouvelle)', async () => {
    const created = await post(serviceAId, coordoCookies, '/patient', {
      firstName: 'Simone',
      lastName: 'Perrin',
      birthDate: '1975-01-01T00:00:00.000Z',
    })
    expect(created.statusCode).toBe(201)
    const patientId = created.json().id as string

    const resCoordo = await searchFrom(
      serviceAId,
      coordoCookies,
      '?firstName=Simone&lastName=Perrin',
    )
    const resSecretariat = await searchFrom(
      serviceAId,
      secretariatCookies,
      '?firstName=Simone&lastName=Perrin',
    )

    expect(resCoordo.statusCode).toBe(200)
    expect(resSecretariat.statusCode).toBe(200)
    expect(resSecretariat.json()).toEqual(resCoordo.json())

    await testDb.patient.delete({ where: { id: patientId } })
  })

  it(
    'choisir une identite existante cree le sous-dossier dans le service courant, sans toucher ' +
      "a l'identite ni au sous-dossier d'un autre service",
    async () => {
      // Cree et suivi dans le service A uniquement (PatientDomain.create y cree deja le
      // sous-dossier).
      const created = await post(serviceAId, coordoCookies, '/patient', {
        firstName: 'Robert',
        lastName: 'Girard',
        gender: 'Homme',
        birthDate: '1990-02-02T00:00:00.000Z',
      })
      expect(created.statusCode).toBe(201)
      const patientId = created.json().id as string
      const identityBeforeAttach = created.json()

      const serviceFileWrite = await patch(
        serviceAId,
        coordoCookies,
        `/patient/${patientId}/service-file`,
        {
          medicalDiagnosis: 'Diagnostic du service A',
          careMode: 'Mode A',
        },
      )
      expect(serviceFileWrite.statusCode).toBe(200)
      const serviceFileABefore = serviceFileWrite.json()

      // Absent du service B avant le rattachement.
      expect(
        (
          await get(
            serviceBId,
            coordoCookies,
            `/patient/${patientId}/service-file`,
          )
        ).statusCode,
      ).toBe(404)

      // Choisir cette identite depuis le service B : cree le sous-dossier dans B, ne cree ni ne
      // modifie rien d'autre.
      const attach = await post(
        serviceBId,
        coordoCookies,
        `/patient/${patientId}/service-file`,
        {},
      )
      expect(attach.statusCode).toBe(200)
      expect(attach.json()).toEqual({ patientId, alreadyFollowedHere: false })

      // Le patient apparait desormais dans la liste du service B.
      const listB = (
        await get(serviceBId, coordoCookies, '/patient/with-tags')
      ).json() as { id: string }[]
      expect(listB.map((p) => p.id)).toContain(patientId)

      // Le sous-dossier du service A, ecrit plus haut, est intact.
      const serviceFileAAfter = await get(
        serviceAId,
        coordoCookies,
        `/patient/${patientId}/service-file`,
      )
      expect(serviceFileAAfter.json()).toEqual(serviceFileABefore)

      // L'identite partagee (Patient) n'a pas bouge.
      const identityAfterAttach = await get(
        serviceAId,
        coordoCookies,
        `/patient/${patientId}`,
      )
      expect(identityAfterAttach.json().firstName).toBe(
        identityBeforeAttach.firstName,
      )
      expect(identityAfterAttach.json().lastName).toBe(
        identityBeforeAttach.lastName,
      )
      expect(identityAfterAttach.json().gender).toBe(
        identityBeforeAttach.gender,
      )
      expect(new Date(identityAfterAttach.json().birthDate).toISOString()).toBe(
        new Date(identityBeforeAttach.birthDate).toISOString(),
      )

      // Le sous-dossier fraichement cree dans B est vide (aucune des seize colonnes n'a ete
      // copiee depuis A) : le rattachement ne "clone" jamais le contenu d'un autre service.
      const serviceFileB = await get(
        serviceBId,
        coordoCookies,
        `/patient/${patientId}/service-file`,
      )
      expect(serviceFileB.statusCode).toBe(200)
      expect(serviceFileB.json().medicalDiagnosis).toBeNull()
      expect(serviceFileB.json().careMode).toBeNull()

      await testDb.patient.delete({ where: { id: patientId } })
    },
  )

  it(
    'le cas deja suivi ici : rattacher une identite qui a deja un sous-dossier dans le service ' +
      'courant le dit clairement et n ecrase rien',
    async () => {
      const created = await post(serviceAId, coordoCookies, '/patient', {
        firstName: 'Nadia',
        lastName: 'Roche',
      })
      expect(created.statusCode).toBe(201)
      const patientId = created.json().id as string

      const serviceFileWrite = await patch(
        serviceAId,
        coordoCookies,
        `/patient/${patientId}/service-file`,
        {
          medicalDiagnosis: 'Diagnostic existant',
        },
      )
      expect(serviceFileWrite.statusCode).toBe(200)
      const before = serviceFileWrite.json()

      // Le patient a deja un sous-dossier dans le service A (cree a sa creation) :
      // tenter de rattacher la meme identite depuis A doit le dire, et ne rien ecraser.
      const attach = await post(
        serviceAId,
        coordoCookies,
        `/patient/${patientId}/service-file`,
        {},
      )
      expect(attach.statusCode).toBe(200)
      expect(attach.json()).toEqual({ patientId, alreadyFollowedHere: true })

      const after = await get(
        serviceAId,
        coordoCookies,
        `/patient/${patientId}/service-file`,
      )
      expect(after.json()).toEqual(before)

      await testDb.patient.delete({ where: { id: patientId } })
    },
  )

  // `%` et `_` sont
  // des jokers du motif `LIKE`/`ILIKE` sous-jacent a `contains`. Sans echappement, une recherche
  // par `%` seul contourne la garde du `.refine` ("au moins un prenom ou un nom") et rend tout
  // l'etablissement ; `_` fait de meme en matchant n'importe quel caractere unique. Ce test
  // prouve les deux sens : le caractere est traite comme du texte (pas de fuite), ET une
  // recherche legitime portant ce caractere dans un vrai nom fonctionne toujours.
  it(
    "un '%' ou un '_' dans le nom cherche est traite comme du texte, jamais comme un joker " +
      'LIKE — et une identite qui porte reellement ce caractere reste trouvable',
    async () => {
      const wildPercent = await post(serviceAId, coordoCookies, '/patient', {
        firstName: '100%Sur',
        lastName: 'Pourcent',
      })
      const wildUnderscore = await post(serviceAId, coordoCookies, '/patient', {
        firstName: 'Sous_Score',
        lastName: 'Underscore',
      })
      const normalOne = await post(serviceAId, coordoCookies, '/patient', {
        firstName: 'Alice',
        lastName: 'Normale',
      })
      const normalTwo = await post(serviceAId, coordoCookies, '/patient', {
        firstName: 'Bruno',
        lastName: 'Ordinaire',
      })
      expect(wildPercent.statusCode).toBe(201)
      expect(wildUnderscore.statusCode).toBe(201)
      expect(normalOne.statusCode).toBe(201)
      expect(normalTwo.statusCode).toBe(201)
      const ids = [wildPercent, wildUnderscore, normalOne, normalTwo].map(
        (r) => r.json().id as string,
      )

      // `%` seul (encode `%25`) : si c'etait un joker, matcherait TOUS les prenoms de
      // l'etablissement. Echappe, il ne matche que le prenom qui porte litteralement un `%`.
      const resPercent = await searchFrom(
        serviceAId,
        coordoCookies,
        '?firstName=%25',
      )
      expect(resPercent.statusCode).toBe(200)
      const bodyPercent = resPercent.json() as {
        results: { id: string }[]
        hasMore: boolean
      }
      expect(bodyPercent.results.map((r) => r.id)).toEqual([
        wildPercent.json().id,
      ])

      // `_` seul : si c'etait un joker, matcherait tout prenom d'au moins un caractere (donc
      // tous). Echappe, il ne matche que le prenom qui porte litteralement un `_`.
      const resUnderscore = await searchFrom(
        serviceAId,
        coordoCookies,
        '?firstName=_',
      )
      expect(resUnderscore.statusCode).toBe(200)
      const bodyUnderscore = resUnderscore.json() as {
        results: { id: string }[]
        hasMore: boolean
      }
      expect(bodyUnderscore.results.map((r) => r.id)).toEqual([
        wildUnderscore.json().id,
      ])

      // Contre-epreuve : une recherche normale ne matche jamais les identites "%"/"_" ci-dessus.
      const resNormal = await searchFrom(
        serviceAId,
        coordoCookies,
        '?firstName=Alice',
      )
      const bodyNormal = resNormal.json() as {
        results: { id: string }[]
        hasMore: boolean
      }
      expect(bodyNormal.results.map((r) => r.id)).toEqual([normalOne.json().id])

      // Recherche legitime portant le caractere dans un nom REEL : toujours trouvable (la garde
      // ne doit pas empecher un vrai "%" ou "_" saisi tel quel de matcher son propre patient).
      const resFullPercent = await searchFrom(
        serviceAId,
        coordoCookies,
        '?firstName=100%25Sur',
      )
      expect(
        (resFullPercent.json() as { results: { id: string }[] }).results.map(
          (r) => r.id,
        ),
      ).toEqual([wildPercent.json().id])
      const resFullUnderscore = await searchFrom(
        serviceAId,
        coordoCookies,
        '?firstName=Sous_Score',
      )
      expect(
        (resFullUnderscore.json() as { results: { id: string }[] }).results.map(
          (r) => r.id,
        ),
      ).toEqual([wildUnderscore.json().id])

      await testDb.patient.deleteMany({ where: { id: { in: ids } } })
    },
  )

  // La recherche
  // s'arrete a vingt resultats sans le dire, sur la fonction dont le seul but est d'eviter les
  // doublons. `hasMore` doit dire qu'il y en a davantage — jamais combien.
  it('la recherche coupe a vingt resultats et le dit via `hasMore`, sans rendre le total exact', async () => {
    const homonymes = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        post(serviceAId, coordoCookies, '/patient', {
          firstName: `H${String(i).padStart(2, '0')}`,
          lastName: 'Vingtcinq',
        }),
      ),
    )
    for (const r of homonymes) {
      expect(r.statusCode).toBe(201)
    }
    const ids = homonymes.map((r) => r.json().id as string)

    const res = await searchFrom(
      serviceAId,
      coordoCookies,
      '?lastName=Vingtcinq',
    )
    expect(res.statusCode).toBe(200)
    const body = res.json() as { results: unknown[]; hasMore: boolean }
    expect(body.results).toHaveLength(20)
    expect(body.hasMore).toBe(true)

    await testDb.patient.deleteMany({ where: { id: { in: ids } } })
  })

  // Le rattachement
  // doit etre idempotent de bout en bout. Six appels HTTP reels en PARALLELE (pas en sequence,
  // qui ne reproduit jamais la course) sur le meme patient depuis le meme service : une seule
  // ligne en base, et AUCUNE reponse en erreur — le cas "deja suivi ici" est un resultat normal,
  // pas un conflit.
  it(
    'le rattachement en parallele (six appels simultanes) est idempotent : une seule ligne en ' +
      'base, aucune reponse 409',
    async () => {
      const created = await post(serviceAId, coordoCookies, '/patient', {
        firstName: 'Course',
        lastName: 'Parallele',
      })
      expect(created.statusCode).toBe(201)
      const patientId = created.json().id as string

      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          post(
            serviceBId,
            coordoCookies,
            `/patient/${patientId}/service-file`,
            {},
          ),
        ),
      )

      for (const res of responses) {
        expect(res.statusCode).toBe(200)
        expect(res.json()).toHaveProperty('patientId', patientId)
      }

      const rows = await testDb.patientServiceFile.findMany({
        where: { patientId, serviceId: serviceBId },
      })
      expect(rows).toHaveLength(1)

      await testDb.patient.delete({ where: { id: patientId } })
    },
  )
})
