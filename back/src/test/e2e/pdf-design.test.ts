import type { FastifyInstance } from 'fastify'

import { buildTestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { tenantUrl, twoServicesScenario } from './setup/fixtures'

const CONTENT = {
  version: 1,
  pages: [{ kind: 'canvas', id: 'p1', background: '#ffffff', elements: [] }],
}

// Cloisonnement : il n'existe toujours pas de lecture par id, donc la preuve prend la forme
// des routes — un design du service B n'apparait pas dans la liste du service A, et un membre
// de A ne peut pas le modifier. Le tableau d'isolation.test.ts attend une lecture par id.
describe('routes des designs de PDF', () => {
  let app: FastifyInstance
  let close: () => Promise<void>
  let scenario: Awaited<ReturnType<typeof twoServicesScenario>>

  beforeAll(async () => {
    await truncateAll()
    const built = await buildTestApp()
    app = built.app
    close = built.close
    scenario = await twoServicesScenario(app)
  })

  afterAll(async () => {
    await close()
    await testDb.$disconnect()
  })

  const lire = (serviceId: string, cookies: { access_token: string }) =>
    app.inject({
      method: 'GET',
      url: tenantUrl(scenario.est.id, serviceId, '/pdf-designs'),
      cookies,
    })

  it('rend les presets globaux a un membre du service', async () => {
    const preset = await testDb.pdfDesignPreset.create({
      data: {
        name: 'Programme de reference',
        content: CONTENT,
        sortOrder: 0,
        // TERMINE : un brouillon n'est propose a aucun service, et ces tests-la parlent de
        // la liste, pas de l'etat du modele.
        publishedAt: new Date(),
      },
    })

    const res = await lire(scenario.serviceA.id, scenario.cookiesA)

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.presets).toHaveLength(1)
    expect(body.presets[0]).toMatchObject({
      id: preset.id,
      name: 'Programme de reference',
      // Un preset n'est jamais le design par defaut : seul un design de service l'est.
      isDefault: false,
    })
    expect(body.designs).toHaveLength(0)
  })

  it('rend les designs du service courant, et pas ceux d un autre service', async () => {
    await testDb.pdfDesign.create({
      data: {
        name: 'Design de A',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceA.id,
      },
    })
    await testDb.pdfDesign.create({
      data: {
        name: 'Design de B',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceB.id,
      },
    })

    const vuDeA = await lire(scenario.serviceA.id, scenario.cookiesA)
    const vuDeB = await lire(scenario.serviceB.id, scenario.cookiesB)

    // Le contrepoint depuis B distingue un vrai cloisonnement d'une preparation ratee :
    // si la creation avait echoue, le proprietaire ne verrait rien non plus.
    expect(vuDeA.json().designs.map((d: { name: string }) => d.name)).toEqual([
      'Design de A',
    ])
    expect(vuDeB.json().designs.map((d: { name: string }) => d.name)).toEqual([
      'Design de B',
    ])
  })

  it('ne rend pas les designs supprimes', async () => {
    await testDb.pdfDesign.create({
      data: {
        name: 'Design archive',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceB.id,
        archivedAt: new Date(),
      },
    })

    const res = await lire(scenario.serviceB.id, scenario.cookiesB)

    expect(res.json().designs.map((d: { name: string }) => d.name)).toEqual([
      'Design de B',
    ])
  })

  // Un contenu invalide en base — un preset retouche a la main, une version future du schema —
  // ne doit faire tomber QUE sa ligne. Les presets etant GLOBAUX, le faire remonter en erreur
  // de reponse eteindrait l'export PDF de tous les services a la fois.
  it('ecarte un design au contenu invalide sans faire tomber la liste', async () => {
    await testDb.pdfDesignPreset.create({
      data: {
        publishedAt: new Date(),
        name: 'Preset casse',
        content: {
          version: 1,
          pages: [
            {
              kind: 'canvas',
              id: 'p1',
              elements: [{ id: 'e1', kind: 'qrcode', x: 0, y: 0, w: 1, h: 1 }],
            },
          ],
        },
        sortOrder: 9,
      },
    })

    const res = await lire(scenario.serviceA.id, scenario.cookiesA)

    expect(res.statusCode).toBe(200)
    const noms = res.json().presets.map((p: { name: string }) => p.name)
    expect(noms).toContain('Programme de reference')
    expect(noms).not.toContain('Preset casse')
  })

  it('refuse a un membre du service A de lire sous le service B', async () => {
    const res = await lire(scenario.serviceB.id, scenario.cookiesA)

    // 404, jamais 403 : l'existence du service B ne doit pas fuir. Un 500 serait une alarme,
    // pas une variante acceptable.
    expect(res.statusCode).toBe(404)
  })

  const creer = (
    serviceId: string,
    cookies: { access_token: string },
    body: Record<string, unknown>,
  ) =>
    app.inject({
      method: 'POST',
      url: tenantUrl(scenario.est.id, serviceId, '/pdf-designs'),
      cookies,
      payload: body,
    })

  const modifier = (
    serviceId: string,
    cookies: { access_token: string },
    id: string,
    body: Record<string, unknown>,
  ) =>
    app.inject({
      method: 'PATCH',
      url: tenantUrl(scenario.est.id, serviceId, `/pdf-designs/${id}`),
      cookies,
      payload: body,
    })

  const supprimer = (
    serviceId: string,
    cookies: { access_token: string },
    id: string,
  ) =>
    app.inject({
      method: 'DELETE',
      url: tenantUrl(scenario.est.id, serviceId, `/pdf-designs/${id}`),
      cookies,
    })

  it('duplique un preset dans le service, contenu copie et source retenue', async () => {
    const preset = await testDb.pdfDesignPreset.findFirstOrThrow({
      where: { name: 'Programme de reference' },
    })

    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {
      sourcePresetId: preset.id,
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({
      name: 'Programme de reference (copie)',
      isDefault: false,
    })
    const enBase = await testDb.pdfDesign.findFirstOrThrow({
      where: {
        serviceId: scenario.serviceA.id,
        name: 'Programme de reference (copie)',
      },
    })
    expect(enBase.sourcePresetId).toBe(preset.id)
    expect(enBase.content).toEqual(preset.content)
  })

  // Review Focus 1 : deux copies du meme preset, pas deux homonymes et pas d'echec.
  it('suffixe la seconde copie du meme preset', async () => {
    const preset = await testDb.pdfDesignPreset.findFirstOrThrow({
      where: { name: 'Programme de reference' },
    })

    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {
      sourcePresetId: preset.id,
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().name).toBe('Programme de reference (copie 2)')
  })

  it('refuse de dupliquer un preset inconnu', async () => {
    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {
      sourcePresetId: 'preset-qui-n-existe-pas',
    })
    expect(res.statusCode).toBe(404)
  })

  it('cree un design vierge quand aucun preset n est nomme', async () => {
    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {})

    expect(res.statusCode).toBe(201)
    // Une toile vide et la page calendrier : de quoi partir.
    expect(
      res.json().content.pages.map((p: { kind: string }) => p.kind),
    ).toEqual(['canvas', 'calendar'])
    // Revue de branche, minor 1 : il s'appelait « Nouveau design (copie) », copie de rien.
    expect(res.json().name).toBe('Nouveau design')
  })

  it('numerote le second design vierge au lieu de le dire copie', async () => {
    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {})

    expect(res.statusCode).toBe(201)
    expect(res.json().name).toBe('Nouveau design 2')
  })

  // Revue de branche, minor 5 : un preset archive restait duplicable par qui connaissait son
  // id. Aucun chemin d'UI n'y menait, mais une route ne se garde pas sur la foi de son ecran.
  it('refuse de dupliquer un preset archive', async () => {
    const archive = await testDb.pdfDesignPreset.create({
      data: {
        name: 'Preset retire',
        content: CONTENT,
        sortOrder: 50,
        publishedAt: new Date(),
        archivedAt: new Date(),
      },
    })

    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {
      sourcePresetId: archive.id,
    })

    expect(res.statusCode).toBe(404)
  })

  // On duplique aussi un design DEJA FAIT du service, pas seulement un modele livre : c'est
  // la seule facon de partir d'un design maison pour en faire une variante.
  it('duplique un design du service, contenu copie et filiation conservee', async () => {
    const preset = await testDb.pdfDesignPreset.findFirstOrThrow({
      where: { name: 'Programme de reference' },
    })
    const source = await testDb.pdfDesign.create({
      data: {
        name: 'Mon programme',
        content: CONTENT,
        sourcePresetId: preset.id,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceA.id,
      },
    })

    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {
      sourceDesignId: source.id,
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({
      name: 'Mon programme (copie)',
      // La copie n'herite pas du statut de defaut : un seul design par defaut par service.
      isDefault: false,
    })
    const enBase = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id, name: 'Mon programme (copie)' },
    })
    expect(enBase.content).toEqual(CONTENT)
    // La filiation se transmet : une copie de copie vient toujours du meme preset.
    expect(enBase.sourcePresetId).toBe(preset.id)
  })

  it('refuse de dupliquer un design d un autre service', async () => {
    const chezB = await testDb.pdfDesign.create({
      data: {
        name: 'Design de B a dupliquer',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceB.id,
      },
    })

    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {
      sourceDesignId: chezB.id,
    })

    expect(res.statusCode).toBe(404)
  })

  // Meme raison qu'un preset archive : un design supprime n'est plus propose, il ne doit pas
  // rester duplicable par qui connait son id.
  it('refuse de dupliquer un design supprime', async () => {
    const supprime = await testDb.pdfDesign.create({
      data: {
        name: 'Design retire',
        content: CONTENT,
        archivedAt: new Date(),
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceA.id,
      },
    })

    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {
      sourceDesignId: supprime.id,
    })

    expect(res.statusCode).toBe(404)
  })

  // Un modele livre en BROUILLON se compose cote super-admin : aucun service ne le voit, et
  // il ne se duplique pas davantage par qui connaitrait son identifiant.
  it('ne propose pas un modele livre en brouillon, ni ne le laisse dupliquer', async () => {
    const brouillon = await testDb.pdfDesignPreset.create({
      data: { name: 'Modele en chantier', content: CONTENT, sortOrder: 90 },
    })

    const liste = await lire(scenario.serviceA.id, scenario.cookiesA)
    expect(liste.json().presets.map((p: { id: string }) => p.id)).not.toContain(
      brouillon.id,
    )

    const copie = await creer(scenario.serviceA.id, scenario.cookiesA, {
      sourcePresetId: brouillon.id,
    })
    expect(copie.statusCode).toBe(404)
  })

  // Un design NEUF est un brouillon : il se compose dans les reglages, et n'est pas propose
  // au moment d'exporter tant qu'il n'est pas termine.
  it('cree un design en brouillon, modele livre ou page blanche', async () => {
    const preset = await testDb.pdfDesignPreset.findFirstOrThrow({
      where: { name: 'Programme de reference' },
    })

    const vierge = await creer(scenario.serviceA.id, scenario.cookiesA, {})
    const copie = await creer(scenario.serviceA.id, scenario.cookiesA, {
      sourcePresetId: preset.id,
    })

    expect(vierge.json().isDraft).toBe(true)
    expect(copie.json().isDraft).toBe(true)
  })

  it('termine un brouillon, et le remet en brouillon', async () => {
    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {})
    const id = res.json().id

    const termine = await modifier(
      scenario.serviceA.id,
      scenario.cookiesA,
      id,
      {
        isDraft: false,
      },
    )
    expect(termine.json().isDraft).toBe(false)
    const enBase = await testDb.pdfDesign.findFirstOrThrow({ where: { id } })
    expect(enBase.publishedAt).not.toBeNull()

    const remis = await modifier(scenario.serviceA.id, scenario.cookiesA, id, {
      isDraft: true,
    })
    expect(remis.json().isDraft).toBe(true)
  })

  // Le design par defaut sert a CHAQUE export : un brouillon ne peut pas l'etre.
  it('refuse de poser un brouillon comme design par defaut', async () => {
    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {})

    const pose = await modifier(
      scenario.serviceA.id,
      scenario.cookiesA,
      res.json().id,
      { isDefault: true },
    )

    expect(pose.statusCode).toBe(400)
  })

  it('accepte de terminer et de poser le defaut d un seul geste', async () => {
    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {})

    const pose = await modifier(
      scenario.serviceA.id,
      scenario.cookiesA,
      res.json().id,
      { isDraft: false, isDefault: true },
    )

    expect(pose.statusCode).toBe(200)
    expect(pose.json()).toMatchObject({ isDraft: false, isDefault: true })
  })

  // Meme regle que la suppression : un design qui n'est plus propose a l'export n'est le
  // defaut de rien, et le laisser marque ferait DEUX defauts des qu'un autre est pose.
  it('decroche le defaut en remettant le design en brouillon', async () => {
    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {})
    const id = res.json().id
    await modifier(scenario.serviceA.id, scenario.cookiesA, id, {
      isDraft: false,
      isDefault: true,
    })

    const remis = await modifier(scenario.serviceA.id, scenario.cookiesA, id, {
      isDraft: true,
    })

    expect(remis.json()).toMatchObject({ isDraft: true, isDefault: false })
  })

  // Un modele livre est fini par construction : il n'a pas d'etat de brouillon a porter.
  it('ne dit jamais brouillon d un modele livre', async () => {
    const res = await lire(scenario.serviceA.id, scenario.cookiesA)

    expect(res.json().presets.length).toBeGreaterThan(0)
    for (const preset of res.json().presets) {
      expect(preset.isDraft).toBe(false)
    }
  })

  // Revue de branche, minor 6 : « Mon design   » se stockait avec ses espaces, et deux noms
  // qui se lisent pareil cohabitaient dans la liste.
  it('rogne les espaces autour du nom', async () => {
    // Son propre design : les cas de ce fichier partagent la base, et renommer celui d'un
    // voisin le ferait tomber sans rapport avec ce qu'il teste.
    const design = await testDb.pdfDesign.create({
      data: {
        name: 'A rogner',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceA.id,
      },
    })

    const res = await modifier(
      scenario.serviceA.id,
      scenario.cookiesA,
      design.id,
      { name: '  Programme du coeur  ' },
    )

    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Programme du coeur')
  })

  it('refuse un nom qui n est fait que d espaces', async () => {
    const design = await testDb.pdfDesign.create({
      data: {
        name: 'A ne pas vider',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceA.id,
      },
    })

    const res = await modifier(
      scenario.serviceA.id,
      scenario.cookiesA,
      design.id,
      { name: '   ' },
    )

    expect(res.statusCode).toBe(400)
  })

  it('renomme un design du service', async () => {
    const design = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id, name: 'Design de A' },
    })

    const res = await modifier(
      scenario.serviceA.id,
      scenario.cookiesA,
      design.id,
      { name: 'Mon programme' },
    )

    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Mon programme')
  })

  // Review Focus 2 : un seul design par defaut a la fois, sinon la modale choisit au hasard.
  it('decroche le design par defaut precedent quand un autre le devient', async () => {
    const [premier, second] = await testDb.pdfDesign.findMany({
      where: { serviceId: scenario.serviceA.id, archivedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 2,
    })

    // On ne pose par defaut qu'un design TERMINE : un brouillon n'est propose a aucun export.
    await modifier(scenario.serviceA.id, scenario.cookiesA, premier.id, {
      isDraft: false,
      isDefault: true,
    })
    await modifier(scenario.serviceA.id, scenario.cookiesA, second.id, {
      isDraft: false,
      isDefault: true,
    })

    const parDefaut = await testDb.pdfDesign.findMany({
      where: { serviceId: scenario.serviceA.id, isDefault: true },
    })
    expect(parDefaut.map((d) => d.id)).toEqual([second.id])
  })

  it('ne decroche PAS le design par defaut d un autre service', async () => {
    const designB = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceB.id, archivedAt: null },
    })
    await modifier(scenario.serviceB.id, scenario.cookiesB, designB.id, {
      isDraft: false,
      isDefault: true,
    })
    const designA = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id, archivedAt: null },
    })
    await modifier(scenario.serviceA.id, scenario.cookiesA, designA.id, {
      isDraft: false,
      isDefault: true,
    })

    const apres = await testDb.pdfDesign.findUniqueOrThrow({
      where: { id: designB.id },
    })
    expect(apres.isDefault).toBe(true)
  })

  it('supprime puis restaure un design', async () => {
    const design = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id, name: 'Mon programme' },
    })

    const suppression = await supprimer(
      scenario.serviceA.id,
      scenario.cookiesA,
      design.id,
    )
    expect(suppression.statusCode).toBe(204)

    const apresSuppression = await lire(scenario.serviceA.id, scenario.cookiesA)
    expect(
      apresSuppression.json().designs.map((d: { id: string }) => d.id),
    ).not.toContain(design.id)

    const restauration = await modifier(
      scenario.serviceA.id,
      scenario.cookiesA,
      design.id,
      { archived: false },
    )
    expect(restauration.statusCode).toBe(200)

    const apresRestauration = await lire(
      scenario.serviceA.id,
      scenario.cookiesA,
    )
    expect(
      apresRestauration.json().designs.map((d: { id: string }) => d.id),
    ).toContain(design.id)
  })

  // Review Focus 3 : supprimer le design par defaut ne doit pas laisser le service sans rien.
  //
  // La premiere version de ce test n'assertait que « il reste des presets », ce qui etait
  // deja vrai AVANT la suppression et serait reste vrai si l'archivage ne faisait rien : il
  // ne pouvait pas rougir (constat I5 de la revue de branche). Ce qu'il doit montrer, c'est
  // que la ligne a bien quitte la liste ET qu'il reste de quoi generer. Le repli lui-meme
  // vit cote front, ou il est tenu par `programme-pdf-modal.test.ts` — le back ne sait rien
  // de l'ordre dans lequel la modale pioche.
  it('sort le design par defaut de la liste et laisse de quoi generer', async () => {
    const design = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id, archivedAt: null },
    })
    await modifier(scenario.serviceA.id, scenario.cookiesA, design.id, {
      isDefault: true,
    })

    await supprimer(scenario.serviceA.id, scenario.cookiesA, design.id)

    const res = await lire(scenario.serviceA.id, scenario.cookiesA)
    const corps = res.json()
    expect(corps.designs.map((d: { id: string }) => d.id)).not.toContain(
      design.id,
    )
    expect(corps.presets.length + corps.designs.length).toBeGreaterThan(0)
  })

  // Trouve a l'ecran : la corbeille affichait un design supprime portant encore le badge
  // « Par defaut ». Un design hors de la liste n'est le defaut de rien, et le laisser marque
  // ferait DEUX defauts des qu'un autre est pose puis celui-la restaure.
  it('decroche le defaut en supprimant le design qui le portait', async () => {
    const design = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id, archivedAt: null },
    })
    await modifier(scenario.serviceA.id, scenario.cookiesA, design.id, {
      isDefault: true,
    })

    await supprimer(scenario.serviceA.id, scenario.cookiesA, design.id)

    const apres = await testDb.pdfDesign.findUniqueOrThrow({
      where: { id: design.id },
    })
    expect(apres.isDefault).toBe(false)
  })

  // Deplace ici depuis la tache 2 (Ruling 1) : c'est une route, elle se teste avec les routes.
  it('rend les designs supprimes quand on les demande, et aucun preset', async () => {
    const res = await app.inject({
      method: 'GET',
      url: tenantUrl(
        scenario.est.id,
        scenario.serviceA.id,
        '/pdf-designs?archived=true',
      ),
      cookies: scenario.cookiesA,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().presets).toEqual([])
    expect(res.json().designs.length).toBeGreaterThan(0)
  })

  it('refuse a un membre du service A de modifier un design du service B', async () => {
    const designB = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceB.id },
    })
    const res = await modifier(
      scenario.serviceA.id,
      scenario.cookiesA,
      designB.id,
      { name: 'vole' },
    )
    expect(res.statusCode).toBe(404)
  })

  it('refuse un contenu qui ne passe pas le schema', async () => {
    const design = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id },
    })
    const res = await modifier(
      scenario.serviceA.id,
      scenario.cookiesA,
      design.id,
      {
        content: {
          version: 1,
          pages: [{ kind: 'canvas', id: 'p', elements: [{ kind: 'qrcode' }] }],
        },
      },
    )
    expect(res.statusCode).toBe(400)
  })

  // Etape 3, Review Focus 3 : l'ecran fait disparaitre le bouton, mais la route se garde
  // elle-meme. Deux calendriers repeteraient le meme planning dans le document.
  it('refuse un contenu portant deux pages calendrier', async () => {
    const design = await testDb.pdfDesign.create({
      data: {
        name: 'A deux calendriers',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceA.id,
      },
    })

    const res = await modifier(
      scenario.serviceA.id,
      scenario.cookiesA,
      design.id,
      {
        content: {
          version: 1,
          pages: [
            { kind: 'calendar', id: 'c1' },
            { kind: 'canvas', id: 'p1', elements: [] },
            { kind: 'calendar', id: 'c2' },
          ],
        },
      },
    )

    expect(res.statusCode).toBe(400)
  })
})
