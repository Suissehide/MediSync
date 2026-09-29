import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  adminUrl,
  createEstablishment,
  createService,
  createUser,
  signIn,
} from './setup/fixtures'

// Pagination et recherche cote serveur du journal d'activite de l'administration (2026-09-29).
// Le journal couvre tout l'etablissement depuis la navigation par echelle : l'ecran ne peut plus
// se contenter de la premiere page de 50 lignes, ni chercher un auteur dans la seule page
// affichee. Fichier distinct de `activity-log-etablissement.test.ts` : la connexion est limitee
// en debit par instance d'application, et ce fichier-la en consomme deja le plafond.
describe('journal d activite : pagination et recherche', () => {
  let t: TestApp

  beforeAll(async () => {
    t = await buildTestApp()
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  beforeEach(truncateAll)

  const scenario = async () => {
    const E = await createEstablishment('E')
    const F = await createEstablishment('F')
    const A = await createService(E.id, 'A')
    await createUser({
      email: 'admin@test.fr',
      memberships: [{ establishmentId: E.id, role: 'ADMIN' }],
    })
    const ligne = (
      entityID: string,
      auteur: { prenom: string; nom: string } = {
        prenom: 'Alice',
        nom: 'Martin',
      },
      establishmentId = E.id,
    ) =>
      testDb.activityLog.create({
        data: {
          establishmentId,
          serviceId: establishmentId === E.id ? A.id : null,
          userID: `u-${auteur.prenom}-${auteur.nom}`,
          userFirstName: auteur.prenom,
          userLastName: auteur.nom,
          action: 'thematic.created',
          entityType: 'thematic',
          entityID,
        },
      })
    const cookies = await signIn(t.app, 'admin@test.fr')
    return { E, F, cookies, ligne }
  }

  const entites = (body: unknown) =>
    (body as { data: { entityID: string }[] }).data
      .map((l) => l.entityID)
      .sort()

  it('pagine sur tout le journal et renvoie le total', async () => {
    const { E, cookies, ligne } = await scenario()
    await ligne('l1')
    await ligne('l2')
    await ligne('l3')

    const page1 = await t.app.inject({
      method: 'GET',
      url: adminUrl(E.id, '/activity-log?pageSize=2&page=1'),
      cookies,
    })
    const page2 = await t.app.inject({
      method: 'GET',
      url: adminUrl(E.id, '/activity-log?pageSize=2&page=2'),
      cookies,
    })

    expect(page1.statusCode).toBe(200)
    expect(page1.json()).toMatchObject({ total: 3, page: 1, pageSize: 2 })
    expect(page1.json().data).toHaveLength(2)
    expect(page2.json()).toMatchObject({ total: 3, page: 2, pageSize: 2 })
    expect([...entites(page1.json()), ...entites(page2.json())].sort()).toEqual(
      ['l1', 'l2', 'l3'],
    )
  })

  it('refuse une taille de page au-dela de 100', async () => {
    const { E, cookies } = await scenario()

    const res = await t.app.inject({
      method: 'GET',
      url: adminUrl(E.id, '/activity-log?pageSize=500'),
      cookies,
    })

    expect(res.statusCode).toBe(400)
  })

  it('cherche un auteur par son nom sur tout le journal, mot par mot et sans casse, dans l etablissement seul', async () => {
    const { E, F, cookies, ligne } = await scenario()
    await ligne('par-camille-durand', { prenom: 'Camille', nom: 'Durand' })
    await ligne('par-camille-martin', { prenom: 'Camille', nom: 'Martin' })
    await ligne(
      'par-camille-ailleurs',
      { prenom: 'Camille', nom: 'Durand' },
      F.id,
    )

    const res = await t.app.inject({
      method: 'GET',
      url: adminUrl(
        E.id,
        `/activity-log?user=${encodeURIComponent('camille DUR')}`,
      ),
      cookies,
    })

    expect(res.statusCode).toBe(200)
    expect(entites(res.json())).toEqual(['par-camille-durand'])
    expect(res.json().total).toBe(1)
  })
})
