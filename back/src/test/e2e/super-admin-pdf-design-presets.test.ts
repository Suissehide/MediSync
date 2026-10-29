import seedPdfDesignPresets from '../../../prisma/seed/pdfDesignPreset'
import { pdfDesignPresetSummarySchema } from '../../main/interfaces/http/fastify/schemas/pdf-design-preset.schema'
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
// LES CINQ ROUTES sont sondees avec un compte ORDINAIRE, pas seulement la lecture : le
// garde-fou de demarrage (`assertSuperAdminShapedRoute`) exige une permission DECLAREE, mais
// son propre commentaire dit qu'il ne PROUVE pas que `requireSuperAdmin` a ete cable sur la
// route — Fastify n'expose pas la chaine de crochets a `onRoute`. Les quatre ecritures
// n'avaient donc aucune preuve. Et chaque 404 a son contrepoint en 200/201 plus bas, sans
// quoi il serait indiscernable d'un 404 de route inexistante.
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
    // `isDefault` n'est NI dans le schema de reponse NI dans la table : l'asserter sur le
    // corps serait vrai deux fois sans rien mesurer — exactement la vacuite relevee a
    // l'etape 4. On le dit donc sur le schema lui-meme, qui est ce qu'on veut tenir.
    expect(Object.keys(pdfDesignPresetSummarySchema.shape)).toEqual([
      'id',
      'name',
      'content',
      'sortOrder',
      'isDraft',
    ])
  })

  // 404, jamais 403 : ne pas reveler une zone qu'on n'a pas le droit de voir. Le 200 du cas
  // precedent est ce qui empeche ce 404 d'etre celui d'une route inexistante.
  it('rend 404 a un compte sans le drapeau, jamais 403', async () => {
    await creerPreset('p-un', 'Programme de reference')

    const res = await lister(cookiesOrdinaire)

    expect(res.statusCode).toBe(404)
  })

  it.each([
    ['POST', '/super-admin/pdf-design-presets', {}],
    ['PATCH', '/super-admin/pdf-design-presets/p-un', { name: 'X' }],
    ['DELETE', '/super-admin/pdf-design-presets/p-un', undefined],
    ['PUT', '/super-admin/pdf-design-presets/reorder', { ids: [] }],
  ])(
    'rend 404 a un compte sans le drapeau sur %s %s',
    async (method, url, payload) => {
      await creerPreset('p-un', 'Un modele')

      const res = await testApp.app.inject({
        method: method as 'POST' | 'PATCH' | 'DELETE' | 'PUT',
        url,
        cookies: cookiesOrdinaire,
        ...(payload ? { payload } : {}),
      })

      expect(res.statusCode).toBe(404)
      // Et rien n'a bouge : un 404 qui aurait quand meme ecrit serait pire qu'un 403.
      expect(await testDb.pdfDesignPreset.count()).toBe(1)
      expect(
        (await testDb.pdfDesignPreset.findUnique({ where: { id: 'p-un' } }))
          ?.name,
      ).toBe('Un modele')
    },
  )

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

  // Un modele NEUF est un brouillon : il se compose ici, et n'est propose a aucun service
  // tant qu'il n'est pas termine. La preuve cote service vit dans pdf-design.test.ts.
  it('cree un modele en brouillon, vierge ou duplique', async () => {
    await creerPreset('p-a-copier', 'A copier', 5)

    const vierge = await creer({})
    const copie = await creer({ sourcePresetId: 'p-a-copier' })

    expect(vierge.json().isDraft).toBe(true)
    expect(copie.json().isDraft).toBe(true)
  })

  it('termine un modele, et le remet en brouillon', async () => {
    const res = await creer({})
    const id = res.json().id

    const termine = await modifier(id, { isDraft: false })
    expect(termine.json().isDraft).toBe(false)
    const enBase = await testDb.pdfDesignPreset.findFirstOrThrow({
      where: { id },
    })
    expect(enBase.publishedAt).not.toBeNull()

    const remis = await modifier(id, { isDraft: true })
    expect(remis.json().isDraft).toBe(true)
  })

  // L'ecran super-admin, lui, montre les brouillons : c'est la qu'on les compose.
  it('liste les brouillons a cote des modeles termines', async () => {
    const brouillon = await creer({})

    const liste = await lister()

    expect(liste.json().map((p: { id: string }) => p.id)).toContain(
      brouillon.json().id,
    )
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

  // Un modele restaure rend son ANCIEN rang, qui peut avoir ete repris entre-temps : deux
  // modeles au meme `sortOrder`, et l'ordre affiche retombe sur le tri secondaire. Le
  // super-admin voit alors un ordre qu'il n'a pas demande, sans rien pour l'expliquer.
  it('range un modele restaure apres les autres, sans doublon de rang', async () => {
    await creerPreset('p-a', 'A', 0)
    await creerPreset('p-b', 'B', 1)
    await supprimer('p-a')
    // B remonte a 0 : le rang 0 est desormais pris.
    await reordonner(['p-b'])

    await modifier('p-a', { archived: false })

    const rangs = (
      (await lister()).json() as { id: string; sortOrder: number }[]
    ).map((p) => p.sortOrder)
    expect(new Set(rangs).size).toBe(rangs.length)
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
