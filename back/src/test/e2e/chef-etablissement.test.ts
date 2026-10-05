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

type Cookies = { access_token: string }

// Le chef d'établissement (`ADMIN`) : COORDINATEUR implicite sur tous les services actifs, et
// renommage de son établissement.
describe('chef d etablissement', () => {
  let testApp: TestApp
  let adminCookies: Cookies
  let memberCookies: Cookies
  let establishmentId: string
  let otherEstablishmentId: string
  let serviceId: string
  let inactiveServiceId: string

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('Etab chef')
    establishmentId = establishment.id
    otherEstablishmentId = (await createEstablishment('Autre')).id
    serviceId = (await createService(establishmentId, 'Non affecte')).id
    const inactive = await createService(establishmentId, 'Desactive')
    inactiveServiceId = inactive.id
    await testDb.service.update({
      where: { id: inactiveServiceId },
      data: { deactivatedAt: new Date() },
    })
    await createUser({
      email: 'chef@b.fr',
      memberships: [{ establishmentId, role: 'ADMIN' }],
    })
    await createUser({
      email: 'membre@b.fr',
      memberships: [{ establishmentId, role: 'MEMBER' }],
    })
    testApp = await buildTestApp()
    adminCookies = await signIn(testApp.app, 'chef@b.fr')
    memberCookies = await signIn(testApp.app, 'membre@b.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('voit dans /me tous les services actifs, comme coordinateur', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/me',
      cookies: adminCookies,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().establishments[0].services).toEqual([
      {
        id: serviceId,
        name: 'Non affecte',
        role: 'COORDINATEUR',
        soignantId: null,
        affecte: false,
      },
    ])
  })

  it('accede a un service ou il n est pas affecte, pas a un service desactive', async () => {
    const ok = await testApp.app.inject({
      method: 'GET',
      url: tenantUrl(establishmentId, serviceId, '/patient'),
      cookies: adminCookies,
    })
    expect(ok.statusCode).toBe(200)
    const inactive = await testApp.app.inject({
      method: 'GET',
      url: tenantUrl(establishmentId, inactiveServiceId, '/patient'),
      cookies: adminCookies,
    })
    expect(inactive.statusCode).toBe(404)
  })

  it('un simple membre n accede pas au service', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: tenantUrl(establishmentId, serviceId, '/patient'),
      cookies: memberCookies,
    })
    expect(res.statusCode).toBe(404)
  })

  it('renomme son etablissement', async () => {
    const res = await testApp.app.inject({
      method: 'PATCH',
      url: adminUrl(establishmentId, '/'),
      cookies: adminCookies,
      payload: { name: 'Nouveau nom' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Nouveau nom')
  })

  it('ne renomme pas un autre etablissement, et un membre ne renomme rien', async () => {
    const autre = await testApp.app.inject({
      method: 'PATCH',
      url: adminUrl(otherEstablishmentId, '/'),
      cookies: adminCookies,
      payload: { name: 'Pirate' },
    })
    expect(autre.statusCode).toBe(404)
    const membre = await testApp.app.inject({
      method: 'PATCH',
      url: adminUrl(establishmentId, '/'),
      cookies: memberCookies,
      payload: { name: 'Pirate' },
    })
    expect(membre.statusCode).toBe(404)
    const autreEnBase = await testDb.establishment.findUniqueOrThrow({
      where: { id: otherEstablishmentId },
    })
    expect(autreEnBase.name).toBe('Autre')
  })
})
