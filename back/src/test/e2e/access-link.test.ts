import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { createUser } from './setup/fixtures'

const NEW_PASSWORD = 'NouveauMotDePasseValide123!!'

describe('POST /auth/access-link/consume', () => {
  let testApp: TestApp

  beforeAll(async () => {
    testApp = await buildTestApp()
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    await truncateAll()
  })

  const issue = (userId: string, issuedBy: string = userId) =>
    testApp.instances.accessLinkDomain.issue(userId, issuedBy)

  const consume = (token: string, password: string = NEW_PASSWORD) =>
    testApp.app.inject({
      method: 'POST',
      url: '/auth/access-link/consume',
      payload: { token, password },
    })

  it('consomme un lien valide et pose le mot de passe : la connexion utilise ensuite le nouveau mot de passe', async () => {
    const user = await createUser({ email: 'premier@etab.fr' })
    const { token } = await issue(user.id)

    const res = await consume(token)

    expect(res.statusCode).toBe(200)
    const signIn = await testApp.app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: 'premier@etab.fr', password: NEW_PASSWORD },
    })
    expect(signIn.statusCode).toBe(200)
  })

  it('un lien deja consomme ne peut pas etre reconsomme', async () => {
    const user = await createUser({ email: 'reconsomme@etab.fr' })
    const { token } = await issue(user.id)

    const first = await consume(token)
    expect(first.statusCode).toBe(200)

    const second = await consume(token)
    expect(second.statusCode).toBe(410)
  })

  it('un lien expire est refuse', async () => {
    const user = await createUser({ email: 'expire@etab.fr' })
    const { token } = await issue(user.id)
    await testDb.accessLink.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const res = await consume(token)

    expect(res.statusCode).toBe(410)
  })

  it("reemettre un lien invalide le precedent du meme compte, le nouveau reste utilisable", async () => {
    const user = await createUser({ email: 'reemis@etab.fr' })
    const previous = await issue(user.id)
    const current = await issue(user.id)

    const oldAttempt = await consume(previous.token)
    expect(oldAttempt.statusCode).toBe(410)

    const newAttempt = await consume(current.token)
    expect(newAttempt.statusCode).toBe(200)
  })

  // Review Focus n°1 (task-4-brief.md) : deux consommations SIMULTANEES du meme jeton ne doivent
  // aboutir qu'une seule fois. Tenu par la base (`updateMany` conditionne sur `usedAt: null`,
  // voir accessLink.repository.ts#consumeIfActive) plutot que par une lecture suivie d'une
  // ecriture, qui laisserait passer les deux sous une vraie course.
  it('deux consommations simultanees du meme lien n aboutissent qu une fois sur deux', async () => {
    const user = await createUser({ email: 'course@etab.fr' })
    const { token } = await issue(user.id)

    const [a, b] = await Promise.all([consume(token), consume(token)])

    const codes = [a.statusCode, b.statusCode].sort()
    expect(codes).toEqual([200, 410])
  })

  // Review Focus n°5 (task-4-brief.md) : un compte desactive refuse un lien pourtant valide, et
  // ce refus ne doit PAS consommer le lien — refuser ne doit jamais bruler le jeton.
  it('un compte desactive refuse un lien pourtant valide, sans consommer le lien', async () => {
    const user = await createUser({ email: 'desactive@etab.fr' })
    const { token } = await issue(user.id)
    await testDb.user.update({
      where: { id: user.id },
      data: { deactivatedAt: new Date() },
    })

    const refused = await consume(token)
    expect(refused.statusCode).toBe(401)

    // Le lien n'a pas ete brule par le refus : une fois le compte reactive, il fonctionne encore.
    await testDb.user.update({
      where: { id: user.id },
      data: { deactivatedAt: null },
    })
    const afterReactivation = await consume(token)
    expect(afterReactivation.statusCode).toBe(200)
  })

  // Cas limites (jeton inconnu, mot de passe trop court) volontairement pas éprouvés ici en plus
  // des scénarios ci-dessus : `POST /auth/access-link/consume` est limité à 10/minute
  // (`access-link.router.ts`), et ce fichier atteint déjà ce budget avec les scénarios requis par
  // le brief (usage unique, expiration, réémission, course, compte désactivé — voir les
  // commentaires de `clinical-fields.test.ts`/`permissions.test.ts` pour la même contrainte sur
  // `/auth/sign-in`). Un jeton inconnu emprunte de toute façon le même chemin de code qu'un lien
  // déjà consommé (`findByTokenHashWithUser` renvoie `null` → 410), déjà exercé plus haut ; une
  // charge invalide (mot de passe trop court) est couverte au niveau unitaire par
  // `access-link-token-leak.test.ts` (« une charge invalide (jeton manquant) »), qui exerce la
  // même branche `accessLinkConsumeSchema.safeParse` → 400.
})
