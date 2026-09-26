// Tache 10, tour de correction 1, arbitrage n°3 : LA SOUPAPE.
//
// La garde du jeton (`MembershipDomain.assertIssuableToken`) refuse a un administrateur
// d'etablissement d'emettre un lien pour un compte rattache ailleurs — sans quoi l'administrateur
// de A prend le controle de l'acces a B. Prise seule, cette garde est une IMPASSE : une personne
// reellement en poste dans deux etablissements qui perd son mot de passe n'a aucun recours. Il
// n'existe ni route de mot de passe oublie, ni changement de mot de passe sans l'ancien
// (`PATCH /me` ne touche pas au mot de passe ; `changePassword` exige l'actuel).
//
// Ce fichier eprouve le recours : le super-admin, seule autorite qui traverse legitimement les
// etablissements, reemet le lien. C'est lui qui rend la garde tenable.
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  adminUrl,
  createEstablishment,
  createService,
  createUser,
  signIn,
} from './setup/fixtures'

const NOUVEAU_MDP = 'MotDePasseRetrouve123!!'

describe('soupape super-admin : reemettre le lien d un compte multi-etablissement', () => {
  let testApp: TestApp
  let superAdminCookies: { access_token: string }
  let etablissementA: string
  let etablissementB: string
  let bilocalId: string

  beforeAll(async () => {
    await truncateAll()
    const a = await createEstablishment('Etablissement A')
    const b = await createEstablishment('Etablissement B')
    etablissementA = a.id
    etablissementB = b.id
    const serviceA = await createService(a.id, 'Service de A')
    const serviceB = await createService(b.id, 'Service de B')

    // La victime est REELLEMENT membre des deux, et administratrice des deux : sans quoi les
    // deux verifications d'acces ci-dessous ne prouveraient rien.
    const bilocal = await createUser({
      email: 'deux-postes@soin.fr',
      memberships: [
        {
          establishmentId: a.id,
          role: 'ADMIN',
          services: [{ serviceId: serviceA.id, role: 'COORDINATEUR' }],
        },
        {
          establishmentId: b.id,
          role: 'ADMIN',
          services: [{ serviceId: serviceB.id, role: 'COORDINATEUR' }],
        },
      ],
    })
    bilocalId = bilocal.id

    await createUser({ email: 'root@plateforme.fr', isSuperAdmin: true })

    testApp = await buildTestApp()
    superAdminCookies = await signIn(testApp.app, 'root@plateforme.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  const reissue = (userId: string, cookies = superAdminCookies) =>
    testApp.app.inject({
      method: 'POST',
      url: `/super-admin/users/${userId}/access-link`,
      cookies,
    })

  it('la victime est bien dans l impasse : son administrateur d etablissement ne peut rien pour elle', async () => {
    const adminA = await signIn(testApp.app, 'deux-postes@soin.fr')
    const appartenance = await testDb.establishmentMembership.findFirstOrThrow({
      where: { userId: bilocalId, establishmentId: etablissementA },
    })

    const res = await testApp.app.inject({
      method: 'POST',
      url: adminUrl(etablissementA, `/members/${appartenance.id}/access-link`),
      cookies: adminA,
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('several establishments')
  })

  it('le super-admin reemet le lien, et les DEUX etablissements restent accessibles a la victime', async () => {
    const res = await reissue(bilocalId)

    expect(res.statusCode).toBe(201)
    expect(Object.keys(res.json())).toEqual(['accessLink'])

    // La chaine complete : le jeton pose reellement un mot de passe, la session s'ouvre, et
    // les deux etablissements repondent. Un 201 seul ne prouverait pas le depannage.
    const consomme = await testApp.app.inject({
      method: 'POST',
      url: '/auth/access-link/consume',
      payload: { token: res.json().accessLink.token, password: NOUVEAU_MDP },
    })
    expect(consomme.statusCode).toBe(200)

    const session = await signIn(testApp.app, 'deux-postes@soin.fr', NOUVEAU_MDP)
    const acces = await Promise.all(
      [etablissementA, etablissementB].map(async (id) =>
        (
          await testApp.app.inject({
            method: 'GET',
            url: adminUrl(id, '/members'),
            cookies: session,
          })
        ).statusCode,
      ),
    )
    expect(acces).toEqual([200, 200])
  })

  it('refuse de reemettre pour un compte desactive', async () => {
    const dormant = await createUser({ email: 'dormant@soin.fr' })
    await testDb.user.update({
      where: { id: dormant.id },
      data: { deactivatedAt: new Date() },
    })

    const res = await reissue(dormant.id)

    expect(res.statusCode).toBe(409)
    expect(await testDb.accessLink.count({ where: { userId: dormant.id } })).toBe(0)
  })

  it('rend 404 sur un compte inconnu, et a qui n est pas super-admin', async () => {
    expect((await reissue('clzzzzzzzzzzzzzzzzzzzzzzz')).statusCode).toBe(404)

    // Herite de `requireSuperAdmin` (super-admin.routes.ts) : 404, jamais 403.
    const ordinaire = await signIn(testApp.app, 'deux-postes@soin.fr', NOUVEAU_MDP)
    expect((await reissue(bilocalId, ordinaire)).statusCode).toBe(404)
  })
})
