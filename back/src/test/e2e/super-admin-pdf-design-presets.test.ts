import seedPdfDesignPresets from '../../../prisma/seed/pdfDesignPreset'
import {
  REFERENCE_PRESET_CONTENT,
  REFERENCE_PRESET_ID,
  REFERENCE_PRESET_NAME,
} from '../../main/utils/pdf-design/reference-preset'
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { createUser, signIn } from './setup/fixtures'

// Les routes de l'ecran super-admin des modeles livres (etape 5). Un modele est GLOBAL : il ne
// vit sous aucun tenant, et c'est `requireSuperAdmin` qui garde, jamais une permission de la
// matrice.
//
// LE COMPTE ORDINAIRE EST DANS CHAQUE CAS, pas seulement dans un test de garde : un 404 sans
// contrepoint est indiscernable d'un 404 de route inexistante.
const CONTENU = {
  version: 1,
  pages: [{ kind: 'canvas', id: 'p1', background: '#ffffff', elements: [] }],
}

const creerPreset = (id: string, name: string, sortOrder = 0) =>
  testDb.pdfDesignPreset.create({
    data: { id, name, content: CONTENU, sortOrder },
  })

describe('routes super-admin des modeles livres', () => {
  let testApp: TestApp
  let cookiesSuperAdmin: { access_token: string }
  let cookiesOrdinaire: { access_token: string }

  beforeAll(async () => {
    await truncateAll()
    testApp = await buildTestApp()
    const superAdmin = await createUser({
      email: 'super@medisync.fr',
      isSuperAdmin: true,
    })
    const ordinaire = await createUser({ email: 'ordinaire@medisync.fr' })
    cookiesSuperAdmin = await signIn(testApp.app, superAdmin.email)
    cookiesOrdinaire = await signIn(testApp.app, ordinaire.email)
  })

  afterEach(async () => {
    await testDb.pdfDesign.deleteMany()
    await testDb.pdfDesignPreset.deleteMany()
    await testDb.service.deleteMany()
    await testDb.establishment.deleteMany()
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  const lister = (
    cookies: { access_token: string } = cookiesSuperAdmin,
    archived = false,
  ) =>
    testApp.app.inject({
      method: 'GET',
      url: `/super-admin/pdf-design-presets?archived=${archived}`,
      cookies,
    })

  const creer = (payload: Record<string, unknown>) =>
    testApp.app.inject({
      method: 'POST',
      url: '/super-admin/pdf-design-presets',
      cookies: cookiesSuperAdmin,
      payload,
    })

  const modifier = (id: string, payload: Record<string, unknown>) =>
    testApp.app.inject({
      method: 'PATCH',
      url: `/super-admin/pdf-design-presets/${id}`,
      cookies: cookiesSuperAdmin,
      payload,
    })

  it('liste les modeles livres', async () => {
    await creerPreset('p-un', 'Programme de reference')

    const res = await lister()

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject([
      { id: 'p-un', name: 'Programme de reference', sortOrder: 0 },
    ])
    // Un modele livre n'est le defaut de personne : `isDefault` appartient aux designs de
    // service, et le promettre ici laisserait croire a un reglage qui n'existe pas.
    expect(res.json()[0].isDefault).toBeUndefined()
  })

  // 404, jamais 403 : ne pas reveler une zone qu'on n'a pas le droit de voir. Le 200 du cas
  // precedent est ce qui empeche ce 404 d'etre celui d'une route inexistante.
  it('rend 404 a un compte sans le drapeau, jamais 403', async () => {
    await creerPreset('p-un', 'Programme de reference')

    const res = await lister(cookiesOrdinaire)

    expect(res.statusCode).toBe(404)
  })

  it('cree un modele vierge et le nomme tout seul', async () => {
    const res = await creer({})

    expect(res.statusCode).toBe(201)
    expect(res.json().name).toBe('Nouveau modèle')
    expect(res.json().content.pages.length).toBeGreaterThan(0)
  })

  it('numerote le deuxieme modele vierge au lieu de faire un homonyme', async () => {
    await creer({})

    const res = await creer({})

    expect(res.json().name).toBe('Nouveau modèle 2')
  })

  it('duplique un modele existant en suffixant son nom', async () => {
    await creerPreset('p-source', 'Programme SMCV')

    const res = await creer({ sourcePresetId: 'p-source' })

    expect(res.statusCode).toBe(201)
    expect(res.json().name).toBe('Programme SMCV (copie)')
    expect(res.json().id).not.toBe('p-source')
    expect(res.json().content).toEqual(CONTENU)
  })

  it('refuse de dupliquer un modele inconnu', async () => {
    const res = await creer({ sourcePresetId: 'inconnu' })

    expect(res.statusCode).toBe(404)
  })

  it('range un modele cree apres les autres', async () => {
    await creerPreset('p-un', 'Premier', 0)

    const res = await creer({})

    expect(res.json().sortOrder).toBe(1)
  })

  it('renomme un modele', async () => {
    await creerPreset('p-maj', 'Avant')

    const res = await modifier('p-maj', { name: 'Apres' })

    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Apres')
  })

  it('enregistre le contenu d un modele', async () => {
    await creerPreset('p-maj', 'Un modele')
    const nouveau = {
      version: 1,
      pages: [
        { kind: 'canvas', id: 'p1', background: '#eeeeee', elements: [] },
        { kind: 'calendar', id: 'c1' },
      ],
    }

    const res = await modifier('p-maj', { content: nouveau })

    expect(res.statusCode).toBe(200)
    expect(res.json().content.pages).toHaveLength(2)
  })

  it('rend 404 sur un modele inconnu', async () => {
    const res = await modifier('inconnu', { name: 'Apres' })

    expect(res.statusCode).toBe(404)
  })

  const supprimer = (id: string) =>
    testApp.app.inject({
      method: 'DELETE',
      url: `/super-admin/pdf-design-presets/${id}`,
      cookies: cookiesSuperAdmin,
    })

  const reordonner = (ids: string[]) =>
    testApp.app.inject({
      method: 'PUT',
      url: '/super-admin/pdf-design-presets/reorder',
      cookies: cookiesSuperAdmin,
      payload: { ids },
    })

  it('supprime un modele, qui sort de la liste active et entre dans les supprimes', async () => {
    await creerPreset('p-un', 'Un modele')

    const res = await supprimer('p-un')

    expect(res.statusCode).toBe(204)
    expect((await lister()).json()).toEqual([])
    expect(
      ((await lister(cookiesSuperAdmin, true)).json() as { id: string }[]).map(
        (p) => p.id,
      ),
    ).toEqual(['p-un'])
  })

  it('restaure un modele supprime', async () => {
    await creerPreset('p-un', 'Un modele')
    await supprimer('p-un')

    const res = await modifier('p-un', { archived: false })

    expect(res.statusCode).toBe(200)
    expect(
      ((await lister()).json() as { id: string }[]).map((p) => p.id),
    ).toEqual(['p-un'])
  })

  it('refuse de supprimer un modele inconnu', async () => {
    expect((await supprimer('inconnu')).statusCode).toBe(404)
  })

  // Une copie deja faite par un service est FIGEE (spec) : supprimer le modele dont elle vient
  // ne doit rien lui faire. Sans cette assertion, archiver un modele pourrait passer pour une
  // operation anodine alors qu'elle toucherait les documents de tous les services.
  it('une copie deja faite par un service survit a la suppression de son modele', async () => {
    await creerPreset('p-source', 'Modele source')
    const etab = await testDb.establishment.create({ data: { name: 'CHU' } })
    const service = await testDb.service.create({
      data: { name: 'Cardio', establishmentId: etab.id },
    })
    const copie = await testDb.pdfDesign.create({
      data: {
        name: 'Modele source (copie)',
        content: CONTENU,
        sourcePresetId: 'p-source',
        establishmentId: etab.id,
        serviceId: service.id,
      },
    })

    await supprimer('p-source')

    const apres = await testDb.pdfDesign.findUnique({ where: { id: copie.id } })
    expect(apres?.archivedAt).toBeNull()
    expect(apres?.content).toEqual(CONTENU)
  })

  // Le modele de REFERENCE est celui dont le seed depend. Son `upsert` porte `update: {}`
  // (seed/pdfDesignPreset.ts) : un rejeu trouve la ligne archivee et n'y touche pas. La
  // suppression tient donc au deploiement suivant, ce qui est le comportement voulu — un
  // modele retire par le super-admin ne doit pas revenir tout seul.
  it('un modele supprime reste supprime apres un rejeu du seed', async () => {
    await testDb.pdfDesignPreset.create({
      data: {
        id: REFERENCE_PRESET_ID,
        name: REFERENCE_PRESET_NAME,
        content: REFERENCE_PRESET_CONTENT,
        sortOrder: 0,
      },
    })
    await supprimer(REFERENCE_PRESET_ID)

    await seedPdfDesignPresets(testDb)

    const apres = await testDb.pdfDesignPreset.findUnique({
      where: { id: REFERENCE_PRESET_ID },
    })
    expect(apres?.archivedAt).not.toBeNull()
    expect((await lister()).json()).toEqual([])
  })

  it('reordonne les modeles', async () => {
    await creerPreset('p-a', 'A', 0)
    await creerPreset('p-b', 'B', 1)

    const res = await reordonner(['p-b', 'p-a'])

    expect(res.statusCode).toBe(204)
    expect(
      ((await lister()).json() as { id: string }[]).map((p) => p.id),
    ).toEqual(['p-b', 'p-a'])
  })

  // Une liste partielle laisserait les absents a leur ancien rang, entremeles avec les
  // nouveaux. Refuser en entier, et ne rien ecrire.
  it('refuse un reordonnancement partiel sans rien changer', async () => {
    await creerPreset('p-a', 'A', 0)
    await creerPreset('p-b', 'B', 1)

    const res = await reordonner(['p-b'])

    expect(res.statusCode).toBe(400)
    expect(
      ((await lister()).json() as { id: string }[]).map((p) => p.id),
    ).toEqual(['p-a', 'p-b'])
  })

  // Un contenu d'une version future, ou retouche a la main en base : il est ECARTE avec sa
  // ligne, jamais propage jusqu'au serialiseur — qui en ferait un 500 sur la liste ENTIERE,
  // donc un ecran vide pour tous les autres modeles.
  it('ecarte un modele au contenu illisible sans perdre les autres', async () => {
    await creerPreset('p-bon', 'Bon', 0)
    await testDb.pdfDesignPreset.create({
      data: {
        id: 'p-casse',
        name: 'Casse',
        content: { version: 99, pages: 'pas un tableau' },
        sortOrder: 1,
      },
    })

    const res = await lister()

    expect(res.statusCode).toBe(200)
    const noms = (res.json() as { name: string }[]).map((p) => p.name)
    expect(noms).toContain('Bon')
    expect(noms).not.toContain('Casse')
  })
})
