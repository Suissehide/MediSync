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

describe('role d une thematique dans les indicateurs', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let cookies: Cookies

  const url = (path: string) => tenantUrl(establishmentId, serviceId, path)

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-ROLE')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-ROLE')
    serviceId = service.id

    await createUser({
      email: 'coordinateur@role.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })

    testApp = await buildTestApp()
    cookies = await signIn(testApp.app, 'coordinateur@role.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('POST avec un role le renvoie dans la reponse', async () => {
    const creation = await testApp.app.inject({
      method: 'POST',
      url: url('/thematic'),
      cookies,
      payload: {
        name: 'Bilan',
        soignantIDs: [],
        role: 'BILAN_DE_FIN',
      } as never,
    })
    expect(creation.statusCode).toBe(201)
    expect(creation.json()).toMatchObject({ role: 'BILAN_DE_FIN' })
  })

  it('PATCH sans le champ role laisse le role existant inchange', async () => {
    const creation = await testApp.app.inject({
      method: 'POST',
      url: url('/thematic'),
      cookies,
      payload: {
        name: 'Diagnostic',
        soignantIDs: [],
        role: 'BILAN_DE_FIN',
      } as never,
    })
    const thematicId = creation.json().id as string

    const renommage = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/thematic/${thematicId}`),
      cookies,
      payload: { name: 'Autre nom' } as never,
    })
    expect(renommage.statusCode).toBe(200)
    expect(renommage.json()).toMatchObject({
      name: 'Autre nom',
      role: 'BILAN_DE_FIN',
    })
  })

  it('PATCH { role: null } efface le role', async () => {
    const creation = await testApp.app.inject({
      method: 'POST',
      url: url('/thematic'),
      cookies,
      payload: {
        name: 'Reactualisation',
        soignantIDs: [],
        role: 'REACTUALISATION',
      } as never,
    })
    const thematicId = creation.json().id as string

    const effacement = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/thematic/${thematicId}`),
      cookies,
      payload: { role: null } as never,
    })
    expect(effacement.statusCode).toBe(200)
    expect(effacement.json()).toMatchObject({ role: null })
  })

  it('PATCH avec un role inconnu est refuse', async () => {
    const creation = await testApp.app.inject({
      method: 'POST',
      url: url('/thematic'),
      cookies,
      payload: { name: 'Test role invalide', soignantIDs: [] } as never,
    })
    const thematicId = creation.json().id as string

    const invalide = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/thematic/${thematicId}`),
      cookies,
      payload: { role: 'INCONNU' } as never,
    })
    expect(invalide.statusCode).toBe(400)
  })

  it('GET /thematic porte le role de chaque element', async () => {
    const liste = await testApp.app.inject({
      method: 'GET',
      url: url('/thematic'),
      cookies,
    })
    expect(liste.statusCode).toBe(200)
    const thematiques = liste.json() as { role: string | null }[]
    expect(thematiques.length).toBeGreaterThan(0)
    for (const thematique of thematiques) {
      expect(thematique).toHaveProperty('role')
    }
  })
})
