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

  // Passe par le VRAI routeur HTTP (schéma Zod, limite de débit, chaîne d'erreurs comprise) :
  // réservé aux scénarios qui ont besoin de la preuve de bout en bout (les scénarios de
  // concurrence, et la propriété centrale d'usage unique). `POST /auth/access-link/consume` est
  // limité à 10/minute (`access-link.router.ts`, comme `/auth/sign-in` — voir les commentaires de
  // `clinical-fields.test.ts`/`permissions.test.ts` pour la même contrainte) : ce fichier n'en
  // consomme que 7 sur 10, pour laisser de la marge ; les
  // scénarios restants appellent le domaine directement (`consumeDirect`, ci-dessous), qui
  // exerce le MÊME code (répository, base réelle) sans passer par la limite de débit.
  const consume = (token: string, password: string = NEW_PASSWORD) =>
    testApp.app.inject({
      method: 'POST',
      url: '/auth/access-link/consume',
      payload: { token, password },
    })

  // Appelle `AccessLinkDomain.consume` directement, contre la même base Postgres réelle que
  // `testApp.app` (même `IocContainer`) : preuve du même comportement, sans passer par la limite
  // de débit de la route ni par le protocole HTTP.
  const consumeDirect = (token: string, password: string = NEW_PASSWORD) =>
    testApp.instances.accessLinkDomain.consume(token, password)

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

  // Deux consommations SIMULTANEES du meme jeton ne doivent
  // aboutir qu'une seule fois. Tenu par la base (`updateMany` conditionne sur `usedAt: null`,
  // voir accessLink.repository.ts#consumeIfActive) plutot que par une lecture suivie d'une
  // ecriture, qui laisserait passer les deux sous une vraie course. Preuve de bout en bout
  // (HTTP) : statusCode des deux reponses.
  it('deux consommations simultanees du meme lien n aboutissent qu une fois sur deux', async () => {
    const user = await createUser({ email: 'course@etab.fr' })
    const { token } = await issue(user.id)

    const [a, b] = await Promise.all([consume(token), consume(token)])

    const codes = [a.statusCode, b.statusCode].sort()
    expect(codes).toEqual([200, 410])
  })

  // Un compte desactive refuse un lien pourtant valide, et
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

  // Ci-dessous : mêmes propriétés, exercées contre le domaine directement (`consumeDirect`), pas
  // contre la route HTTP — pour ne pas consommer le budget de la limite de débit du dessus. Le
  // dépôt et la base sont réels dans les deux cas ; seule la couche HTTP (schéma, limite de
  // débit) est court-circuitée.

  it('un lien expire est refuse', async () => {
    const user = await createUser({ email: 'expire@etab.fr' })
    const { token } = await issue(user.id)
    await testDb.accessLink.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    await expect(consumeDirect(token)).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 410 },
    })
  })

  it('reemettre un lien invalide le precedent du meme compte, le nouveau reste utilisable', async () => {
    const user = await createUser({ email: 'reemis@etab.fr' })
    const previous = await issue(user.id)
    const current = await issue(user.id)

    await expect(consumeDirect(previous.token)).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 410 },
    })

    await expect(consumeDirect(current.token)).resolves.toBeUndefined()
  })

  // Un jeton JAMAIS ÉMIS emprunte une branche distincte
  // (`AccessLinkRepository.findByTokenHashWithUser` renvoie `null`, voir
  // `accessLink.domain.ts#consume`) d'un jeton déjà consommé ou expiré (qui existe en base, mais
  // dont `consumeIfActive` échoue) : la branche `!link` est ici couverte.
  it('un jeton jamais emis (branche distincte d un jeton deja consomme) est refuse', async () => {
    await expect(
      consumeDirect('jeton-qui-n-a-jamais-ete-emis-0123456789'),
    ).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 410 },
    })
  })

  // Le nombre de survivants est VARIABLE, sans ratio stable
  // observé d'une machine à l'autre (mesuré sur plusieurs exécutions : quatre ou cinq
  // survivants). Contrairement à la réémission SÉQUENTIELLE
  // ci-dessus (qui invalide bien le lien précédent), l'ÉMISSION n'a pas de course fermée — voir
  // le commentaire détaillé sur `AccessLinkDomain.issue`. Le nombre exact n'est PAS garanti par
  // construction (`invalidateActiveForUser` et `create` ne formant pas une seule opération
  // atomique). La seule affirmation que ce test vérifie, et qui est vraie dans TOUS les cas
  // observés jusqu'ici, quelle que soit la machine, est qu'il en reste PLUS QU'UN : si la course
  // était fermée (un seul lien vivant par compte, quoi qu'il arrive), ce nombre serait toujours 1.
  // Vérifié directement contre la base (`usedAt: null` = utilisable), sans passer par la route de
  // consommation : ce n'est pas ce qui est éprouvé ici.
  it('emissions simultanees pour le meme compte : plus d un lien reste utilisable (course NON fermee, assume)', async () => {
    const user = await createUser({ email: 'six-emissions@etab.fr' })

    await Promise.all(Array.from({ length: 6 }, () => issue(user.id)))

    const liensUtilisables = await testDb.accessLink.findMany({
      where: { userId: user.id, usedAt: null },
    })
    expect(liensUtilisables.length).toBeGreaterThan(1)
  })
})
