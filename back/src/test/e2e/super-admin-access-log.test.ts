import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
} from './setup/fixtures'

// Tache 6, etape 4b : `GET /super-admin/access-log`. Ferme deux trous laisses par l'etape
// precedente (taches 1 a 5) -- voir le commentaire de tete de
// interfaces/http/fastify/routes/super-admin/access-log.ts pour le detail.
//
// DEUX ETABLISSEMENTS REELLEMENT PEUPLES, PAS UN SEUL (tour de correction 1, tache 5 -- lecon
// tiree par la revue de cette tache-la : une fixture a un seul etablissement laissait les 234
// tests e2e verts quand on retirait la borne d'etablissement d'une lecture voisine). Cette route
// lit a l'echelle de la PLATEFORME entiere : sans un second etablissement reellement peuple, rien
// ne distinguerait « la route ignore le filtre d'etablissement » de « il n'y a qu'un
// etablissement de toute facon ».
// ENVELOPPE PAGINEE depuis le 2026-10-01 : la reponse n'est plus un tableau nu mais
// `{ data, total, page, pageSize }` (§8 de docs/multi-tenant/decisions-etape-4b.md, fermee ce
// jour-la). Ce raccourci evite de recopier `.data` dans quarante assertions dont le sujet est le
// FILTRE, pas la pagination ; les tests de pagination, eux, lisent `total`/`page` explicitement.
const lignes = <T,>(res: { json: () => unknown }): T[] =>
  (res.json() as { data: T[] }).data

describe('GET /super-admin/access-log', () => {
  let testApp: TestApp
  let etabA: { id: string }
  let etabB: { id: string }
  let serviceA: { id: string }
  let serviceB: { id: string }
  let compte: { id: string }
  let cookiesSuperAdmin: { access_token: string }
  let cookiesAdminOrdinaire: { access_token: string }

  beforeAll(async () => {
    await truncateAll()
    testApp = await buildTestApp()

    etabA = await createEstablishment('Etablissement A')
    etabB = await createEstablishment('Etablissement B')
    serviceA = await createService(etabA.id, 'Service A')
    serviceB = await createService(etabB.id, 'Service B')

    const patientA = await testDb.patient.create({
      data: {
        firstName: 'Prenom-A-Confidentiel',
        lastName: 'Nom-A-Confidentiel',
        createDate: new Date(),
        establishmentId: etabA.id,
      },
    })
    const patientB = await testDb.patient.create({
      data: {
        firstName: 'Prenom-B-Confidentiel',
        lastName: 'Nom-B-Confidentiel',
        createDate: new Date(),
        establishmentId: etabB.id,
      },
    })

    // Les lignes du journal des CONSULTATIONS, sur les DEUX etablissements -- ecrites
    // directement en base plutot que rejouees via le crochet (deja eprouve par
    // patient-access-log.test.ts), une par etablissement, avec un compte et une action
    // distincts pour eprouver les trois filtres. `accesParOctroi` DIFFERE entre les deux
    // (tour de correction 1, tache 10) : une fixture a valeur unique ne prouverait pas que la
    // route rend la vraie valeur de chaque ligne plutot qu'une constante.
    await testDb.patientAccessLog.createMany({
      data: [
        {
          establishmentId: etabA.id,
          serviceId: serviceA.id,
          patientId: patientA.id,
          userID: 'u-coordinateur-a',
          userFirstName: 'Ada',
          userLastName: 'DuServiceA',
          action: 'dossier.ouvert',
          accesParOctroi: true,
        },
        {
          establishmentId: etabB.id,
          serviceId: serviceB.id,
          patientId: patientB.id,
          userID: 'u-coordinateur-b',
          userFirstName: 'Belle',
          userLastName: 'DuServiceB',
          action: 'export',
          accesParOctroi: false,
        },
      ],
    })

    // Le compte cible du script d'amorcage (`UserDomain.bootstrapSuperAdmin`) : la ligne
    // qu'aucune autre route ne peut lire, celle que cette tache rend enfin lisible.
    compte = await createUser({
      email: 'promu-super-admin@test.fr',
      isSuperAdmin: true,
    })
    await testDb.activityLog.create({
      data: {
        userID: 'cli:bootstrap-super-admin',
        action: 'superAdmin.granted',
        entityType: 'user',
        entityID: compte.id,
      },
    })

    await createUser({ email: 'super@test.fr', isSuperAdmin: true })
    await createUser({
      email: 'admin-ordinaire@test.fr',
      memberships: [{ establishmentId: etabA.id, role: 'ADMIN' }],
    })

    cookiesSuperAdmin = await signIn(testApp.app, 'super@test.fr')
    cookiesAdminOrdinaire = await signIn(testApp.app, 'admin-ordinaire@test.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  // Etape 1 du brief (task-6-brief.md), inchange : la ligne du script d'amorcage, qu'aucune
  // autre route ne peut lire (verifie par balayage sur /super-admin dans
  // super-admin-acces.test.ts, et par construction ici : ni la route d'etablissement -- qui
  // exige un `establishmentId` precis, absent sur cette ligne -- ni aucune route de tenant --
  // qui n'existe que sous un tenant -- ne peuvent l'atteindre).
  it('rend les lignes du script d amorcage, que nulle autre route ne peut lire', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=activite',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    expect(
      lignes<{ userID: string }>(res).some(
        (l) => l.userID === 'cli:bootstrap-super-admin',
      ),
    ).toBe(true)
  })

  it('repond 404 a un compte sans le drapeau, jamais 403', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log',
      cookies: cookiesAdminOrdinaire,
    })
    expect(res.statusCode).toBe(404)
  })

  // Le second trou que cette tache ferme : AUCUNE route ne lisait `PatientAccessLog` a
  // l'echelle de la plateforme avant cette tache. Preuve directe : les DEUX etablissements
  // apparaissent, sans filtre.
  //
  // SABORDAGE ETROIT (etape 4, brief), EPROUVE PAR EXECUTION PUIS REVERTE AVANT CE COMMIT :
  // retirer l'entree `PatientAccessLog` de `SUPERADMIN_OPERATIONS` (tenant-guard.ts) fait
  // rougir CE test (et les trois suivants, qui partagent le meme `source=acces`) avec un 500
  // (`TenantScopeMissingError`, absorbe par le gestionnaire d'erreurs Fastify) -- jamais une
  // liste vide : le garde-fou refuse la lecture AVANT MEME D'ATTEINDRE LA BASE, exactement
  // comme documente sur `PatientAccessLogRepository.findAllPlatformWide`. Les deux tests
  // `source=activite`/404 ci-dessus restent verts sous ce sabordage (ils n'atteignent jamais
  // `PatientAccessLog`) -- c'est ce qui prouve que le refus vient bien de la declaration
  // manquante pour CE modele, pas d'une panne plus large du prefixe /super-admin.
  it('source=acces rend les acces des DEUX etablissements, sans filtre', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=acces',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    expect(
      new Set(
        lignes<{ establishmentId: string }>(res).map((l) => l.establishmentId),
      ),
    ).toEqual(new Set([etabA.id, etabB.id]))
  })

  it('filtre par etablissement', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: `/super-admin/access-log?source=acces&establishmentId=${etabA.id}`,
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    const body = lignes<{ establishmentId: string }>(res)
    expect(body.length).toBeGreaterThan(0)
    expect(body.every((l) => l.establishmentId === etabA.id)).toBe(true)
  })

  it('filtre par compte, sur l identifiant exact (ce que faisait l ancien filtre userID)', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=acces&compte=u-coordinateur-b',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    const body = lignes<{ userID: string }>(res)
    expect(body.length).toBeGreaterThan(0)
    expect(body.every((l) => l.userID === 'u-coordinateur-b')).toBe(true)
  })

  // REVUE FINALE DE BRANCHE, Important n°1 : le filtre accepte desormais AUSSI un fragment de
  // prenom/nom, insensible a la casse — la forme que l'ecran produit reellement. C'est ce qui
  // permet de le brancher au serveur sans perdre la recherche par nom que l'ecran offrait (et
  // qu'il appliquait, lui, sur la page deja tronquee).
  it('filtre par compte, sur un fragment de nom, insensible a la casse', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=acces&compte=DUSERVICEB',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    const body = lignes<{ userID: string }>(res)
    expect(body.length).toBeGreaterThan(0)
    expect(body.every((l) => l.userID === 'u-coordinateur-b')).toBe(true)
  })

  // Un fragment qui serait traite comme un JOKER par Postgres ne doit rien rendre de plus
  // qu'une recherche litterale — meme garde, et meme fonction (`escapeLikePattern`), que la
  // recherche d'identite de patient. Sans elle, « % » rendrait TOUTE la plateforme.
  it('ne traite pas le pourcent comme un joker', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=acces&compte=%25',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    expect(lignes(res)).toEqual([])
  })

  it('filtre par action', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=acces&action=export',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    const body = lignes<{ action: string }>(res)
    expect(body.length).toBeGreaterThan(0)
    expect(body.every((l) => l.action === 'export')).toBe(true)
  })

  // Tour de correction 1 (tache 10) : `accesParOctroi` doit sortir de cette route aussi,
  // liee a la BONNE etablissement -- pas une constante. La fixture porte true pour A, false
  // pour B (voir plus haut) : un test qui ne verifierait qu'une des deux valeurs ne
  // prouverait pas que l'autre est bien rendue.
  it('expose accesParOctroi sur source=acces, avec sa vraie valeur par etablissement', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=acces',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    const body = lignes<{
      establishmentId: string
      accesParOctroi: boolean
    }>(res)
    const ligneA = body.find((l) => l.establishmentId === etabA.id)
    const ligneB = body.find((l) => l.establishmentId === etabB.id)
    expect(ligneA?.accesParOctroi).toBe(true)
    expect(ligneB?.accesParOctroi).toBe(false)
  })

  // `ActivityLog` n'a pas cette notion : `null`, jamais `false` -- `false` affirmerait a tort
  // un acces reel la ou aucun octroi n'existe meme conceptuellement (voir le commentaire du
  // schema de reponse).
  it('rend accesParOctroi a null sur source=activite (la notion n existe pas pour ce journal)', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=activite',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    const body = lignes<{ accesParOctroi: boolean | null }>(res)
    expect(body.length).toBeGreaterThan(0)
    expect(body.every((l) => l.accesParOctroi === null)).toBe(true)
  })

  // Arbitrage de l'etape 4a, non rouvert ici (voir le brief) : le super-admin compte les
  // patients, il ne les lit pas. Cette route ne rend donc jamais une IDENTITE de patient --
  // seulement un identifiant (`patientId`). Verifie par recherche de sous-chaine sur le corps
  // BRUT (meme double verification que superAdminUser.schema.ts, accountSearchResponseSchema),
  // en plus de la cle exacte : un nom de patient qui fuiterait sous une cle imprevue serait
  // invisible a une assertion qui ne regarderait que les cles connues.
  // ------------------------------------------------------------------------------------
  // AU-DELA DE LA PREMIERE PAGE : CE QUE LE FILTRE SERVEUR ATTEINT, ET CE QUE LA PAGINATION
  // ATTEINT DEPUIS LE 2026-10-01.
  // ------------------------------------------------------------------------------------
  //
  // CE BLOC A CHANGE DE SUJET, ET LES DEUX SUJETS COMPTENT. Il eprouvait `PLATFORM_ACCESS_LOG_LIMIT`
  // (200, `createdAt desc`) : une ligne ancienne tombait hors de la reponse, et le filtre serveur
  // etait la SEULE facon de la ramener — un filtre navigateur, lui, ne voit que ce qui est deja
  // arrive. Cette borne dure n'existe plus (§8 de docs/multi-tenant/decisions-etape-4b.md, fermee),
  // remplacee par une pagination. Les cas de filtre restent : ils prouvent toujours que le filtre
  // est evalue EN BASE, ce qui n'a rien perdu de son importance. S'y ajoutent les cas qui prouvent
  // ce que la borne rendait impossible : atteindre cette ligne ancienne EN PAGINANT, et savoir
  // qu'elle existe (`total`).
  describe('au-dela de la premiere page', () => {
    const ANCIEN = new Date('2020-01-01T00:00:00.000Z')

    beforeAll(async () => {
      // 250 lignes RECENTES sur le journal d'activite — la premiere page est pleine, et pleine
      // de lignes qui ne nous interessent pas.
      await testDb.activityLog.createMany({
        data: Array.from({ length: 250 }, (_, i) => ({
          establishmentId: etabA.id,
          serviceId: serviceA.id,
          userID: `u-bruit-${i}`,
          userFirstName: 'Bruit',
          userLastName: 'Recent',
          action: 'patient.created',
          entityType: 'patient',
          entityID: `p-bruit-${i}`,
        })),
      })
      // LA ligne cherchee : ancienne, donc hors de la page de 200.
      await testDb.activityLog.create({
        data: {
          establishmentId: etabA.id,
          serviceId: serviceA.id,
          userID: 'u-tres-ancien',
          userFirstName: 'Zoe',
          userLastName: 'Ancienne',
          action: 'patient.updated',
          entityType: 'patient',
          entityID: 'p-ancien',
          createdAt: ANCIEN,
        },
      })
    })

    it('la premiere page ne porte PAS la ligne ancienne, mais le total dit qu elle existe', async () => {
      const res = await testApp.app.inject({
        method: 'GET',
        url: '/super-admin/access-log?source=activite',
        cookies: cookiesSuperAdmin,
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as {
        data: { userID: string }[]
        total: number
        page: number
        pageSize: number
      }
      // Taille de page par defaut du schema (50), pas la borne dure de 200 qui n'existe plus.
      expect(body.pageSize).toBe(50)
      expect(body.page).toBe(1)
      expect(body.data.length).toBe(50)
      expect(body.data.some((l) => l.userID === 'u-tres-ancien')).toBe(false)
      // CE QUE LA BORNE DURE NE DISAIT PAS : une reponse de 200 lignes ne distinguait pas « il y en
      // a 200 » de « il y en a 200 000 ». `total` compte TOUT le perimetre demande, hors page.
      expect(body.total).toBeGreaterThan(250)
    })

    // LE CAS QUE LA BORNE DURE RENDAIT IMPOSSIBLE, et la raison d'etre de cette pagination : la
    // ligne la plus ANCIENNE du perimetre est atteignable, sans aucun filtre, en demandant la
    // derniere page. Le numero de cette page est DERIVE de `total`, jamais ecrit en dur : une
    // constante ici se desynchroniserait du volume de la fixture a la premiere ligne ajoutee, et le
    // test deviendrait vrai par hasard.
    it('la derniere page porte la ligne la plus ancienne, sans aucun filtre', async () => {
      const premiere = await testApp.app.inject({
        method: 'GET',
        url: '/super-admin/access-log?source=activite&pageSize=100',
        cookies: cookiesSuperAdmin,
      })
      const { total } = premiere.json() as { total: number }
      const derniere = Math.ceil(total / 100)
      expect(derniere).toBeGreaterThan(1)

      const res = await testApp.app.inject({
        method: 'GET',
        url: `/super-admin/access-log?source=activite&pageSize=100&page=${derniere}`,
        cookies: cookiesSuperAdmin,
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as {
        data: { userID: string }[]
        page: number
      }
      expect(body.page).toBe(derniere)
      expect(body.data.some((l) => l.userID === 'u-tres-ancien')).toBe(true)
    })

    // Deux pages consecutives ne se recouvrent pas et ne sautent rien : c'est l'arithmetique
    // `skip = (page - 1) * pageSize`. Un `skip` egal a `page` (l'erreur classique) ferait se
    // recouvrir les deux pages presque entierement, et ce test-la rougirait.
    it('deux pages consecutives ne partagent aucune ligne', async () => {
      const [p1, p2] = await Promise.all([
        testApp.app.inject({
          method: 'GET',
          url: '/super-admin/access-log?source=activite&pageSize=10&page=1',
          cookies: cookiesSuperAdmin,
        }),
        testApp.app.inject({
          method: 'GET',
          url: '/super-admin/access-log?source=activite&pageSize=10&page=2',
          cookies: cookiesSuperAdmin,
        }),
      ])
      const ids1 = lignes<{ id: string }>(p1).map((l) => l.id)
      const ids2 = lignes<{ id: string }>(p2).map((l) => l.id)
      expect(ids1).toHaveLength(10)
      expect(ids2).toHaveLength(10)
      expect(ids1.filter((id) => ids2.includes(id))).toEqual([])
    })

    // Sans plafond, `pageSize=100000` referait exactement la lecture non bornee que cette
    // pagination remplace — la borne de requete a change de place, elle n'a pas disparu.
    it('refuse une taille de page au-dela de 100', async () => {
      const res = await testApp.app.inject({
        method: 'GET',
        url: '/super-admin/access-log?source=activite&pageSize=500',
        cookies: cookiesSuperAdmin,
      })
      expect(res.statusCode).toBe(400)
    })

    // LE DECOMPTE SUIT LE PERIMETRE DEMANDE, jamais la table entiere : un `total` calcule sur un
    // `where` plus large annoncerait des pages vides, et la table du front proposerait des numeros
    // de page qui ne rendent rien. Le filtre ci-dessous ne retient qu'UNE ligne.
    it('total compte le perimetre demande, pas toute la table', async () => {
      const res = await testApp.app.inject({
        method: 'GET',
        url: '/super-admin/access-log?source=activite&compte=ancienne',
        cookies: cookiesSuperAdmin,
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as { data: unknown[]; total: number }
      expect(body.total).toBe(1)
      expect(body.data).toHaveLength(1)
    })

    // `source=acces` PAGINE AUSSI, et c'est cette lecture-la qui a exige de RE-DECLARER
    // `PatientAccessLog.count` dans `SUPERADMIN_OPERATIONS` (tenant-guard.ts). SABOTAGE EPROUVE :
    // retirer cette entree fait repondre 500 a ce test (le garde-fou refuse le decompte avant
    // d'atteindre la base), jamais un `total` de zero.
    it('source=acces rend aussi un total, decompte en base', async () => {
      const res = await testApp.app.inject({
        method: 'GET',
        url: '/super-admin/access-log?source=acces&pageSize=1',
        cookies: cookiesSuperAdmin,
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as { data: unknown[]; total: number }
      expect(body.data).toHaveLength(1)
      // Deux lignes de consultation dans la fixture, sur deux etablissements : le total les voit
      // toutes les deux alors que la page n'en porte qu'une.
      expect(body.total).toBe(2)
    })

    it('le filtre compte, lui, la trouve — ce qu un filtre navigateur ne pouvait pas', async () => {
      const res = await testApp.app.inject({
        method: 'GET',
        url: '/super-admin/access-log?source=activite&compte=ancienne',
        cookies: cookiesSuperAdmin,
      })
      expect(res.statusCode).toBe(200)
      const body = lignes<{ userID: string }>(res)
      expect(body.length).toBe(1)
      expect(body[0]?.userID).toBe('u-tres-ancien')
    })

    // LE CAS QUI MOTIVE LA VALEUR RESERVEE. La ligne du script d'amorcage est ecrite sans
    // etablissement et c'est l'une des plus anciennes de la table : passe 200 entrees, elle
    // sort de la page, et AUCUN filtre ne permettait de la viser — la liste deroulante de
    // l'ecran ne propose que des etablissements REELS. La documentation presentait pourtant sa
    // lisibilite comme ACQUISE (« l'un des deux trous que cet ecran ferme »).
    it('la ligne du script d amorcage sort de la premiere page, mais reste visable', async () => {
      const sansFiltre = await testApp.app.inject({
        method: 'GET',
        url: '/super-admin/access-log?source=activite',
        cookies: cookiesSuperAdmin,
      })
      expect(
        lignes<{ userID: string }>(sansFiltre).some(
          (l) => l.userID === 'cli:bootstrap-super-admin',
        ),
      ).toBe(false)

      const cible = await testApp.app.inject({
        method: 'GET',
        url: '/super-admin/access-log?source=activite&establishmentId=aucun',
        cookies: cookiesSuperAdmin,
      })
      expect(cible.statusCode).toBe(200)
      const body = lignes<{
        userID: string
        establishmentId: string | null
      }>(cible)
      expect(body.length).toBeGreaterThan(0)
      expect(body.every((l) => l.establishmentId === null)).toBe(true)
      expect(body.some((l) => l.userID === 'cli:bootstrap-super-admin')).toBe(
        true,
      )
    })

    // `PatientAccessLog.establishmentId` est NON NULLABLE : la question n'a pas de sens sur ce
    // journal-la, et un 400 le DIT — la ou une liste vide laisserait croire « aucune
    // aujourd'hui, peut-etre demain ».
    it('refuse la valeur reservee sur le journal des consultations, par un 400', async () => {
      const res = await testApp.app.inject({
        method: 'GET',
        url: '/super-admin/access-log?source=acces&establishmentId=aucun',
        cookies: cookiesSuperAdmin,
      })
      expect(res.statusCode).toBe(400)
    })
  })

  it('ne rend jamais d identite de patient — seulement des identifiants', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=acces',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('Prenom-A-Confidentiel')
    expect(res.body).not.toContain('Nom-A-Confidentiel')
    expect(res.body).not.toContain('Prenom-B-Confidentiel')
    expect(res.body).not.toContain('Nom-B-Confidentiel')
    const body = lignes<{ patientId: string | null }>(res)
    expect(
      body.some(
        (l) => typeof l.patientId === 'string' && l.patientId.length > 0,
      ),
    ).toBe(true)
  })
})
