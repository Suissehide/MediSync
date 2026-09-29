// Tâche 8 (étape 4a) : les octrois temporaires (spec §3.5, §4.3, §6.2). Trois routes :
//   - `POST /super-admin/grants` : s'accorder l'accès, motif obligatoire, durée bornée.
//   - `DELETE /super-admin/grants/:id` : révoquer avant terme (pose `revokedAt`, ne supprime
//     jamais la ligne).
//   - `GET /e/:establishmentId/admin/grants` : l'administrateur de l'établissement voit les
//     octrois, en cours et passés, avec leur motif et leur auteur.
//
// UNE SEULE connexion par compte pour tout ce fichier (`beforeAll`, jamais dans un `it`) :
// `POST /auth/sign-in` porte une limite de débit de DIX par minute
// (`interfaces/http/fastify/routes/auth/sign-in.router.ts`), et ce fichier tourne en une seule
// fois, `--runInBand`, sur la MÊME instance d'application — une connexion PAR TEST l'aurait
// dépassée (démontré par exécution lors de la première version de ce fichier : 429 dès le
// sixième test). Chaque test crée en revanche son PROPRE établissement (gratuit, hors limite),
// pour rester indépendant des autres sans jamais tronquer la base entre deux tests : tronquer
// aurait invalidé les cookies déjà obtenus (le compte qu'ils désignent aurait disparu).
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  adminUrl,
  createEstablishment,
  createUser,
  signIn,
} from './setup/fixtures'

const HOUR_MS = 60 * 60 * 1000
// Tolérance de rapprochement entre l'horloge de l'application (qui calcule `expiresAt`) et celle
// du serveur Postgres (qui pose `grantedAt` via `@default(now())`) : les deux tournent sur la
// même machine de test, l'écart réel est de l'ordre de la milliseconde — quelques secondes de
// marge absorbent tout aléa d'exécution sans jamais masquer une erreur d'heure (un défaut à 4h ou
// 24h se traduirait par un écart de PLUSIEURS MINUTES au minimum).
const TOLERANCE_MS = 5000

describe('octrois temporaires (tache 8)', () => {
  let t: TestApp
  let superAdminId: string
  let superAdminCookies: { access_token: string }
  let autreSuperAdminCookies: { access_token: string }
  let adminCibleCookies: { access_token: string }
  let adminAutreCookies: { access_token: string }
  let cible: { id: string }
  let autre: { id: string }

  beforeAll(async () => {
    await truncateAll()
    t = await buildTestApp()

    const superAdmin = await createUser({
      email: 'super@test.fr',
      isSuperAdmin: true,
    })
    superAdminId = superAdmin.id
    superAdminCookies = await signIn(t.app, 'super@test.fr')

    // Un SECOND super-admin, distinct du premier — sert uniquement à prouver qu'il ne peut pas
    // révoquer les octrois du premier (tour de correction 1, tâche 8, mineur signalé en
    // relecture).
    await createUser({ email: 'autre-super@test.fr', isSuperAdmin: true })
    autreSuperAdminCookies = await signIn(t.app, 'autre-super@test.fr')

    cible = await createEstablishment('Cible')
    autre = await createEstablishment('Autre')
    await createUser({
      email: 'admin-cible@test.fr',
      memberships: [{ establishmentId: cible.id, role: 'ADMIN' }],
    })
    adminCibleCookies = await signIn(t.app, 'admin-cible@test.fr')
    await createUser({
      email: 'admin-autre@test.fr',
      memberships: [{ establishmentId: autre.id, role: 'ADMIN' }],
    })
    adminAutreCookies = await signIn(t.app, 'admin-autre@test.fr')
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  const postGrant = (payload: Record<string, unknown>) =>
    t.app.inject({
      method: 'POST',
      url: '/super-admin/grants',
      cookies: superAdminCookies,
      payload,
    })

  const countGrantsFor = (establishmentId: string) =>
    testDb.superAdminAccessGrant.count({ where: { establishmentId } })

  describe('POST /super-admin/grants', () => {
    it('refuse un motif absent', async () => {
      const est = await createEstablishment('SansMotif')

      const res = await postGrant({ establishmentId: est.id })

      expect(res.statusCode).toBe(400)
      expect(await countGrantsFor(est.id)).toBe(0)
    })

    // Step 1 (task-8-brief.md) : une chaine VIDE est refusee elle aussi — pas seulement une
    // absence de champ. Sans cette exigence precise, un motif " " passerait.
    it('refuse un motif vide (chaine vide, y compris espaces)', async () => {
      const est = await createEstablishment('MotifVide')

      const vide = await postGrant({ establishmentId: est.id, reason: '' })
      expect(vide.statusCode).toBe(400)

      const espaces = await postGrant({
        establishmentId: est.id,
        reason: '   ',
      })
      expect(espaces.statusCode).toBe(400)

      expect(await countGrantsFor(est.id)).toBe(0)
    })

    // Step 2 (task-8-brief.md) : quatre heures par defaut quand la duree est omise.
    it('accorde un acces de quatre heures par defaut', async () => {
      const est = await createEstablishment('DureeDefaut')

      const res = await postGrant({
        establishmentId: est.id,
        reason: 'diagnostic support',
      })

      expect(res.statusCode).toBe(201)
      const grant = await testDb.superAdminAccessGrant.findUniqueOrThrow({
        where: { id: res.json().id },
      })
      const delta = grant.expiresAt.getTime() - grant.grantedAt.getTime()
      expect(Math.abs(delta - 4 * HOUR_MS)).toBeLessThan(TOLERANCE_MS)
    })

    // Step 2 : vingt-quatre heures, la borne haute, est ACCEPTEE.
    it('accepte une demande de vingt-quatre heures, exactement', async () => {
      const est = await createEstablishment('Duree24h')

      const res = await postGrant({
        establishmentId: est.id,
        reason: 'intervention longue',
        durationHours: 24,
      })

      expect(res.statusCode).toBe(201)
      const grant = await testDb.superAdminAccessGrant.findUniqueOrThrow({
        where: { id: res.json().id },
      })
      const delta = grant.expiresAt.getTime() - grant.grantedAt.getTime()
      expect(Math.abs(delta - 24 * HOUR_MS)).toBeLessThan(TOLERANCE_MS)
    })

    // Step 2, l'exigence centrale : quarante-huit heures est REFUSEE, pas ramenee a
    // vingt-quatre en silence. On verifie a la fois le statut ET qu'aucune ligne n'a ete
    // ecrite avec une duree tronquee.
    it('refuse une demande de quarante-huit heures, sans la ramener a vingt-quatre', async () => {
      const est = await createEstablishment('Duree48h')

      const res = await postGrant({
        establishmentId: est.id,
        reason: 'intervention trop longue',
        durationHours: 48,
      })

      expect(res.statusCode).toBe(400)
      expect(await countGrantsFor(est.id)).toBe(0)
    })

    it('refuse un etablissement inconnu, sans rien ecrire', async () => {
      const avant = await testDb.superAdminAccessGrant.count()

      const res = await postGrant({
        establishmentId: 'etablissement-inexistant',
        reason: 'diagnostic',
      })

      expect(res.statusCode).toBe(404)
      expect(await testDb.superAdminAccessGrant.count()).toBe(avant)
    })

    // Mineur signalé en relecture (tâche 8, tour de correction 1) : sans ce garde, la route
    // rendait 201 sur un établissement désactivé, sans jamais rien accorder derrière — un octroi
    // sur un établissement désactivé n'apparaît jamais dans une lecture (CONTRAT 1,
    // `accessGrant.repository.interface.ts`). Refusé désormais à l'écriture, pour ne pas laisser
    // l'appelant croire qu'il a obtenu un accès.
    it('refuse un octroi sur un etablissement desactive, sans rien ecrire', async () => {
      const est = await createEstablishment('Desactive')
      await testDb.establishment.update({
        where: { id: est.id },
        data: { deactivatedAt: new Date() },
      })

      const res = await postGrant({
        establishmentId: est.id,
        reason: 'diagnostic',
      })

      expect(res.statusCode).toBe(409)
      expect(await countGrantsFor(est.id)).toBe(0)
    })

    // Tour de correction 1 (tâche 8) — Important n°2 de la relecture : sans ce garde, un second
    // octroi vivant sur le même établissement était accepté (201), et `/me` aurait listé
    // l'établissement deux fois (voir `accessGrant.domain.test.ts`, « dedoublonne deux octrois
    // vivants... », pour la moitié « lecture » du remède ; ce test couvre la moitié « écriture »,
    // qui l'empêche à la source).
    it('refuse un second octroi vivant sur un etablissement qui en a deja un', async () => {
      const est = await createEstablishment('DejaOctroye')

      const premier = await postGrant({
        establishmentId: est.id,
        reason: 'premiere intervention',
      })
      expect(premier.statusCode).toBe(201)

      const second = await postGrant({
        establishmentId: est.id,
        reason: 'seconde intervention',
      })
      expect(second.statusCode).toBe(409)
      expect(await countGrantsFor(est.id)).toBe(1)
    })

    it("l'octroi cree confere reellement l'acces, visible depuis /me", async () => {
      const est = await createEstablishment('AccesReel')

      const res = await postGrant({
        establishmentId: est.id,
        reason: 'intervention',
      })
      expect(res.statusCode).toBe(201)

      const me = await t.app.inject({
        method: 'GET',
        url: '/me',
        cookies: superAdminCookies,
      })
      expect(me.json().establishments).toContainEqual(
        expect.objectContaining({
          id: est.id,
          role: 'ADMIN',
          origine: 'octroi',
        }),
      )
    })
  })

  describe('DELETE /super-admin/grants/:id', () => {
    it('revoque avant terme : referme l acces des la requete suivante', async () => {
      const est = await createEstablishment('Revocation')

      const created = await postGrant({
        establishmentId: est.id,
        reason: 'intervention',
      })
      const grantId = created.json().id

      const avant = await t.app.inject({
        method: 'GET',
        url: '/me',
        cookies: superAdminCookies,
      })
      expect(avant.json().establishments).toContainEqual(
        expect.objectContaining({ id: est.id }),
      )

      const del = await t.app.inject({
        method: 'DELETE',
        url: `/super-admin/grants/${grantId}`,
        cookies: superAdminCookies,
      })
      expect(del.statusCode).toBe(204)

      const apres = await t.app.inject({
        method: 'GET',
        url: '/me',
        cookies: superAdminCookies,
      })
      expect(
        (apres.json().establishments as { id: string }[]).some(
          (e) => e.id === est.id,
        ),
      ).toBe(false)

      // La ligne survit, revoquee — jamais supprimee (spec §4.3 : la trace comptable est le
      // mecanisme).
      const row = await testDb.superAdminAccessGrant.findUniqueOrThrow({
        where: { id: grantId },
      })
      expect(row.revokedAt).not.toBeNull()
    })

    it('un id inconnu rend 404', async () => {
      const res = await t.app.inject({
        method: 'DELETE',
        url: '/super-admin/grants/id-inconnu',
        cookies: superAdminCookies,
      })
      expect(res.statusCode).toBe(404)
    })

    // Mineur signalé en relecture (tâche 8, tour de correction 1) : la révocation n'était
    // restreinte à personne — n'importe quel super-admin pouvait clore l'octroi d'un autre.
    // Restreint désormais au titulaire (spec §3.5, « s'accorder l'accès ») : 404, jamais 403,
    // pour ne pas distinguer « n'existe pas » de « n'est pas à vous ».
    it("un autre super-admin ne peut pas revoquer l'octroi d'un tiers", async () => {
      const est = await createEstablishment('OctroiDautrui')
      const created = await postGrant({
        establishmentId: est.id,
        reason: 'intervention',
      })
      const grantId = created.json().id

      const del = await t.app.inject({
        method: 'DELETE',
        url: `/super-admin/grants/${grantId}`,
        cookies: autreSuperAdminCookies,
      })
      expect(del.statusCode).toBe(404)

      const row = await testDb.superAdminAccessGrant.findUniqueOrThrow({
        where: { id: grantId },
      })
      expect(row.revokedAt).toBeNull()
    })

    // Mineur signalé en relecture : une double révocation réécrivait `revokedAt` avec
    // l'horodatage courant. Idempotent désormais, PRÉCISION comprise : la PREMIÈRE date reste.
    it('revoquer un octroi deja revoque garde la premiere date', async () => {
      const est = await createEstablishment('DoubleRevocation')
      const created = await postGrant({
        establishmentId: est.id,
        reason: 'intervention',
      })
      const grantId = created.json().id

      const premiere = await t.app.inject({
        method: 'DELETE',
        url: `/super-admin/grants/${grantId}`,
        cookies: superAdminCookies,
      })
      expect(premiere.statusCode).toBe(204)
      const apresPremiere =
        await testDb.superAdminAccessGrant.findUniqueOrThrow({
          where: { id: grantId },
        })
      const premiereDate = apresPremiere.revokedAt
      expect(premiereDate).not.toBeNull()

      // Écart réel, mesurable : sans lui, une réécriture bornée à la même milliseconde que la
      // première passerait ce test par accident, sans jamais avoir prouvé l'idempotence.
      await new Promise((resolve) => setTimeout(resolve, 50))

      const seconde = await t.app.inject({
        method: 'DELETE',
        url: `/super-admin/grants/${grantId}`,
        cookies: superAdminCookies,
      })
      expect(seconde.statusCode).toBe(204)
      const apresSeconde = await testDb.superAdminAccessGrant.findUniqueOrThrow(
        { where: { id: grantId } },
      )
      expect(apresSeconde.revokedAt?.getTime()).toBe(premiereDate?.getTime())
    })
  })

  describe('GET /e/:establishmentId/admin/grants', () => {
    it("l'administrateur de l'etablissement voit les octrois en cours et passes, avec motif et auteur", async () => {
      // `passe` DOIT être créé et révoqué AVANT `enCours` : depuis le tour de correction 1
      // (tâche 8), un second octroi vivant sur un établissement qui en a déjà un est refusé
      // (409) — les deux ne peuvent donc jamais coexister VIVANTS, seulement l'un après l'autre.
      const passe = await postGrant({
        establishmentId: cible.id,
        reason: 'diagnostic clos',
      })
      await t.app.inject({
        method: 'DELETE',
        url: `/super-admin/grants/${passe.json().id}`,
        cookies: superAdminCookies,
      })
      const enCours = await postGrant({
        establishmentId: cible.id,
        reason: 'diagnostic en cours',
      })

      const res = await t.app.inject({
        method: 'GET',
        url: adminUrl(cible.id, '/grants'),
        cookies: adminCibleCookies,
      })

      expect(res.statusCode).toBe(200)
      const rows = res.json() as {
        id: string
        reason: string
        revokedAt: string | null
        grantedBy: { id: string; email: string }
      }[]
      const enCoursRow = rows.find((r) => r.id === enCours.json().id)
      const passeRow = rows.find((r) => r.id === passe.json().id)
      expect(enCoursRow).toMatchObject({
        reason: 'diagnostic en cours',
        revokedAt: null,
        grantedBy: { id: superAdminId, email: 'super@test.fr' },
      })
      expect(passeRow).toMatchObject({ reason: 'diagnostic clos' })
      expect(passeRow?.revokedAt).not.toBeNull()
    })

    it("un administrateur d'un autre etablissement n'y voit rien", async () => {
      // Un octroi existe bien sur `cible` (pose par le test precedent, et ce test ne tronque
      // rien) : la preuve d'isolation porte sur la VISIBILITE, pas sur l'absence d'octroi.
      expect(await countGrantsFor(cible.id)).toBeGreaterThan(0)

      // Sur son PROPRE etablissement (`autre`) : aucun octroi ne le concerne.
      const surSonEtablissement = await t.app.inject({
        method: 'GET',
        url: adminUrl(autre.id, '/grants'),
        cookies: adminAutreCookies,
      })
      expect(surSonEtablissement.statusCode).toBe(200)
      expect(surSonEtablissement.json()).toEqual([])

      // Sur l'etablissement CIBLE, auquel il n'appartient pas : 404, comme tout acces
      // d'administration a un etablissement etranger.
      const surCible = await t.app.inject({
        method: 'GET',
        url: adminUrl(cible.id, '/grants'),
        cookies: adminAutreCookies,
      })
      expect(surCible.statusCode).toBe(404)
    })
  })
})
