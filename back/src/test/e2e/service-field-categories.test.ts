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

type CategoryResponse = {
  id: string
  label: string
  order: number
  dateField: 'entryDate' | 'exitDate' | null
  archived: boolean
}

type FieldResponse = {
  id: string
  key: string
  label: string
  categoryId: string
  order: number
  archived: boolean
}

describe('categories de la fiche', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let coordinateurCookies: Cookies
  let intervenantCookies: Cookies

  const url = (path: string) => tenantUrl(establishmentId, serviceId, path)

  const listCategories = async (cookies: Cookies) => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: url('/service-field-categories'),
      cookies,
    })
    return res
  }

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-CATEGORIES')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-CATEGORIES')
    serviceId = service.id

    await createUser({
      email: 'coordinateur@categories.fr',
      memberships: [
        {
          establishmentId,
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })
    await createUser({
      email: 'intervenant@categories.fr',
      memberships: [
        {
          establishmentId,
          services: [{ serviceId, role: 'INTERVENANT' }],
        },
      ],
    })

    testApp = await buildTestApp()
    coordinateurCookies = await signIn(
      testApp.app,
      'coordinateur@categories.fr',
    )
    intervenantCookies = await signIn(testApp.app, 'intervenant@categories.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  let entryId: string
  let exitId: string
  let dieteticId: string

  it('un service neuf recoit les deux categories par defaut, meme sous deux lectures paralleles', async () => {
    const [first, second] = await Promise.all([
      listCategories(coordinateurCookies),
      listCategories(coordinateurCookies),
    ])
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)

    const categories = first.json() as CategoryResponse[]
    expect(categories.map((c) => c.label)).toEqual([
      'Parcours & Inclusion',
      'Sortie & Bilan',
    ])
    expect(categories.map((c) => c.dateField)).toEqual([
      'entryDate',
      'exitDate',
    ])
    expect(categories.every((c) => !c.archived)).toBe(true)

    const entry = categories.find((c) => c.dateField === 'entryDate')
    const exit = categories.find((c) => c.dateField === 'exitDate')
    if (!entry || !exit) {
      throw new Error('categories a date manquantes')
    }
    entryId = entry.id
    exitId = exit.id

    const total = await testDb.serviceFieldCategory.count({
      where: { serviceId },
    })
    expect(total).toBe(2)
  })

  it('cree, renomme puis reordonne une nouvelle categorie avant Sortie & Bilan', async () => {
    const creation = await testApp.app.inject({
      method: 'POST',
      url: url('/service-field-categories'),
      cookies: coordinateurCookies,
      payload: { label: 'Suivi diete' } as never,
    })
    expect(creation.statusCode).toBe(201)
    const created = creation.json() as CategoryResponse
    expect(created.order).toBe(2)
    expect(created.dateField).toBeNull()
    dieteticId = created.id

    const renommage = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-field-categories/${dieteticId}`),
      cookies: coordinateurCookies,
      payload: { label: 'Suivi dietetique' } as never,
    })
    expect(renommage.statusCode).toBe(200)
    expect((renommage.json() as CategoryResponse).label).toBe(
      'Suivi dietetique',
    )

    const reorder = await testApp.app.inject({
      method: 'PUT',
      url: url('/service-field-categories/order'),
      cookies: coordinateurCookies,
      payload: { ids: [entryId, dieteticId, exitId] } as never,
    })
    expect(reorder.statusCode).toBe(204)

    const liste = await listCategories(coordinateurCookies)
    const categories = liste.json() as CategoryResponse[]
    expect(categories.map((c) => c.id)).toEqual([entryId, dieteticId, exitId])
    expect(categories.map((c) => c.order)).toEqual([0, 1, 2])
  })

  it('une categorie a date ne peut pas etre supprimee', async () => {
    const res = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-field-categories/${entryId}`),
      cookies: coordinateurCookies,
      payload: { archived: true } as never,
    })
    expect(res.statusCode).toBe(400)
  })

  let champId: string

  it('une categorie non vide ne peut pas etre supprimee, le devient apres deplacement de son champ', async () => {
    const champ = await testApp.app.inject({
      method: 'POST',
      url: url('/service-fields'),
      cookies: coordinateurCookies,
      payload: {
        label: 'Regime',
        type: 'text',
        categoryId: dieteticId,
      } as never,
    })
    expect(champ.statusCode).toBe(201)
    champId = (champ.json() as FieldResponse).id

    const refus = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-field-categories/${dieteticId}`),
      cookies: coordinateurCookies,
      payload: { archived: true } as never,
    })
    expect(refus.statusCode).toBe(400)
    expect(refus.json()).toMatchObject({
      message: "Déplacez ou supprimez d'abord ses champs",
    })

    const deplacement = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-fields/${champId}`),
      cookies: coordinateurCookies,
      payload: { categoryId: exitId } as never,
    })
    expect(deplacement.statusCode).toBe(200)
    const champDeplace = deplacement.json() as FieldResponse
    expect(champDeplace.categoryId).toBe(exitId)
    expect(champDeplace.order).toBe(0)

    const suppression = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-field-categories/${dieteticId}`),
      cookies: coordinateurCookies,
      payload: { archived: true } as never,
    })
    expect(suppression.statusCode).toBe(200)
    expect((suppression.json() as CategoryResponse).archived).toBe(true)

    const restauration = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-field-categories/${dieteticId}`),
      cookies: coordinateurCookies,
      payload: { archived: false } as never,
    })
    expect(restauration.statusCode).toBe(200)
    expect((restauration.json() as CategoryResponse).archived).toBe(false)
  })

  it('deplacer un champ vers une categorie supprimee ou d un autre service : 400, le champ n a pas bouge', async () => {
    const supprimee = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-field-categories/${dieteticId}`),
      cookies: coordinateurCookies,
      payload: { archived: true } as never,
    })
    expect(supprimee.statusCode).toBe(200)

    const versSupprimee = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-fields/${champId}`),
      cookies: coordinateurCookies,
      payload: { categoryId: dieteticId } as never,
    })
    expect(versSupprimee.statusCode).toBe(400)

    const serviceB = await createService(establishmentId, 'S-CATEGORIES-B')
    const categorieB = await testDb.serviceFieldCategory.create({
      data: {
        establishmentId,
        serviceId: serviceB.id,
        label: 'Parcours & Inclusion',
        order: 0,
        dateField: 'entryDate',
      },
    })
    const entryIdB = categorieB.id

    const versAutreService = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-fields/${champId}`),
      cookies: coordinateurCookies,
      payload: { categoryId: entryIdB } as never,
    })
    expect(versAutreService.statusCode).toBe(400)

    const relu = await testDb.serviceFieldDefinition.findUniqueOrThrow({
      where: { id: champId },
    })
    expect(relu.categoryId).toBe(exitId)

    const restauree = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-field-categories/${dieteticId}`),
      cookies: coordinateurCookies,
      payload: { archived: false } as never,
    })
    expect(restauree.statusCode).toBe(200)
  })

  it('PUT /service-fields/order refuse un jeu qui n est pas exactement celui de la categorie', async () => {
    const res = await testApp.app.inject({
      method: 'PUT',
      url: url('/service-fields/order'),
      cookies: coordinateurCookies,
      payload: {
        categoryId: exitId,
        ids: [champId, 'clzzzzzzzzzzzzzzzzzzzzzzz'],
      } as never,
    })
    expect(res.statusCode).toBe(400)
  })

  it('GET /service-fields range les champs par categorie puis par ordre', async () => {
    const autreChamp = await testApp.app.inject({
      method: 'POST',
      url: url('/service-fields'),
      cookies: coordinateurCookies,
      payload: { label: 'Etape', type: 'text', categoryId: entryId } as never,
    })
    expect(autreChamp.statusCode).toBe(201)

    const liste = await testApp.app.inject({
      method: 'GET',
      url: url('/service-fields'),
      cookies: coordinateurCookies,
    })
    const champs = liste.json() as FieldResponse[]
    expect(champs.map((f) => f.categoryId)).toEqual([entryId, exitId])
  })

  it('intervenant : 403 en ecriture, 200 en lecture', async () => {
    const creation = await testApp.app.inject({
      method: 'POST',
      url: url('/service-field-categories'),
      cookies: intervenantCookies,
      payload: { label: 'Autre' } as never,
    })
    expect(creation.statusCode).toBe(403)

    const lecture = await listCategories(intervenantCookies)
    expect(lecture.statusCode).toBe(200)
  })

  it('isolation entre services : la categorie du service A est invisible et inaccessible depuis B', async () => {
    const serviceB = await createService(establishmentId, 'S-CATEGORIES-C')
    await createUser({
      email: 'coordinateur-b@categories.fr',
      memberships: [
        {
          establishmentId,
          services: [{ serviceId: serviceB.id, role: 'COORDINATEUR' }],
        },
      ],
    })
    const cookiesB = await signIn(testApp.app, 'coordinateur-b@categories.fr')
    const urlB = (path: string) => tenantUrl(establishmentId, serviceB.id, path)

    const liste = await testApp.app.inject({
      method: 'GET',
      url: urlB('/service-field-categories'),
      cookies: cookiesB,
    })
    const categoriesB = liste.json() as CategoryResponse[]
    expect(categoriesB.map((c) => c.id)).not.toContain(entryId)

    const patch = await testApp.app.inject({
      method: 'PATCH',
      url: urlB(`/service-field-categories/${entryId}`),
      cookies: cookiesB,
      payload: { label: 'X' } as never,
    })
    expect(patch.statusCode).toBe(404)
  })
})
