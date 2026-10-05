import type { Mail } from '../../main/types/infra/mail/mailer.interface'
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

const NEW_PASSWORD = 'NouveauMotDePasseValide123!!'

// Faux transport branché sur le port d'envoi (`mailer.send`) : les e-mails sont capturés, le
// contenu (et donc le lien) reste celui que le domaine a réellement produit.
describe('e-mails d invitation et mot de passe oublie', () => {
  let testApp: TestApp
  let sent: { kind: string; mail: Mail }[]
  let establishmentId: string
  let serviceId: string

  beforeAll(async () => {
    testApp = await buildTestApp()
    jest
      .spyOn(testApp.instances.mailer, 'send')
      .mockImplementation((kind, mail) => {
        sent.push({ kind, mail })
      })
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    sent = []
    await truncateAll()
    establishmentId = (await createEstablishment('Clinique des Lilas')).id
    serviceId = (await createService(establishmentId, 'Cardiologie')).id
    await createUser({
      email: 'admin@lilas.fr',
      memberships: [{ establishmentId, role: 'ADMIN' }],
    })
  })

  const tokenOf = (mail: Mail): string => {
    const match = /\/auth\/access-link#([\w-]+)/.exec(mail.text)
    if (!match) {
      throw new Error('aucun lien dans le mail')
    }
    return match[1]
  }

  const waitForMail = async () => {
    for (let i = 0; i < 100 && sent.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  const setPasswordAndSignIn = async (token: string, email: string) => {
    const consume = await testApp.app.inject({
      method: 'POST',
      url: '/auth/access-link/consume',
      payload: { token, password: NEW_PASSWORD },
    })
    expect(consume.statusCode).toBe(200)
    await signIn(testApp.app, email, NEW_PASSWORD)
  }

  it('invite par e-mail a la creation du compte : la personne se connecte sans intervention', async () => {
    const cookies = await signIn(testApp.app, 'admin@lilas.fr')

    const res = await testApp.app.inject({
      method: 'POST',
      url: adminUrl(establishmentId, '/members/account'),
      cookies,
      payload: {
        email: 'nouvelle@lilas.fr',
        firstName: 'Ana',
        lastName: 'Lys',
        role: 'MEMBER',
        services: [{ serviceId, role: 'INTERVENANT' }],
      },
    })

    expect(res.statusCode).toBe(201)
    expect(sent).toHaveLength(1)
    const { kind, mail } = sent[0]
    expect(kind).toBe('invitation')
    expect(mail.to).toBe('nouvelle@lilas.fr')
    expect(mail.text).toContain('Clinique des Lilas')
    // Neutre : jamais le service (qui dit la specialite, donc la pathologie).
    expect(`${mail.subject}${mail.text}${mail.html}`).not.toContain(
      'Cardiologie',
    )
    // L'admin garde le lien copiable : c'est le meme jeton.
    expect(tokenOf(mail)).toBe(res.json().accessLink.token)

    await setPasswordAndSignIn(tokenOf(mail), 'nouvelle@lilas.fr')
  })

  // MDS-17 : l'invitation par un coordinateur est le CINQUIEME chemin qui remet un jeton, et il
  // passe par le meme coeur (`createAccountCore`) — donc par le meme envoi. Le dire par
  // execution : si l'envoi redescendait dans `createAccount` seul, cette personne resterait sans
  // acces alors que la route a rendu 201.
  it('invite par e-mail quand c est un coordinateur qui invite dans son service', async () => {
    await createUser({
      email: 'coord@lilas.fr',
      memberships: [
        { establishmentId, services: [{ serviceId, role: 'COORDINATEUR' }] },
      ],
    })
    const cookies = await signIn(testApp.app, 'coord@lilas.fr')

    const res = await testApp.app.inject({
      method: 'POST',
      url: tenantUrl(establishmentId, serviceId, '/membres'),
      cookies,
      payload: {
        email: 'recrue@lilas.fr',
        firstName: 'Noé',
        role: 'SECRETARIAT',
      },
    })

    expect(res.statusCode).toBe(201)
    await waitForMail()
    expect(sent.map((s) => [s.kind, s.mail.to])).toEqual([
      ['invitation', 'recrue@lilas.fr'],
    ])
    expect(sent[0].mail.text).toContain('Clinique des Lilas')
    // Toujours pas le service : il dit la specialite, donc la pathologie.
    const mail = sent[0].mail
    expect(`${mail.subject}${mail.text}${mail.html}`).not.toContain(
      'Cardiologie',
    )
    expect(tokenOf(mail)).toBe(res.json().accessLink.token)

    await setPasswordAndSignIn(tokenOf(mail), 'recrue@lilas.fr')
  })

  it('renvoie l e-mail a la reemission du lien', async () => {
    const cookies = await signIn(testApp.app, 'admin@lilas.fr')
    const user = await createUser({
      email: 'membre@lilas.fr',
      memberships: [{ establishmentId }],
    })
    const membership = await testDb.establishmentMembership.findFirstOrThrow({
      where: { userId: user.id },
    })

    const res = await testApp.app.inject({
      method: 'POST',
      url: adminUrl(establishmentId, `/members/${membership.id}/access-link`),
      cookies,
    })

    expect(res.statusCode).toBe(201)
    expect(sent.map((s) => s.mail.to)).toEqual(['membre@lilas.fr'])
    expect(tokenOf(sent[0].mail)).toBe(res.json().accessLink.token)
  })

  it('previent sans jeton un compte deja en poste ailleurs, rattache directement', async () => {
    const cookies = await signIn(testApp.app, 'admin@lilas.fr')
    const autre = await createEstablishment('Autre')
    await createUser({
      email: 'bilocal@lilas.fr',
      memberships: [{ establishmentId: autre.id }],
    })

    const res = await testApp.app.inject({
      method: 'POST',
      url: adminUrl(establishmentId, '/members/account'),
      cookies,
      payload: { email: 'bilocal@lilas.fr', role: 'MEMBER' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().accessLink).toBeNull()
    expect(sent).toHaveLength(1)
    expect(sent[0].kind).toBe('member-added')
    expect(sent[0].mail.text).toContain('Clinique des Lilas')
    expect(sent[0].mail.text).not.toContain('#')
  })

  it('suit l invitation : en attente, expiree apres 30 jours, renvoyee, puis acceptee', async () => {
    const cookies = await signIn(testApp.app, 'admin@lilas.fr')
    const created = await testApp.app.inject({
      method: 'POST',
      url: adminUrl(establishmentId, '/members/account'),
      cookies,
      payload: { email: 'invitee@lilas.fr', role: 'MEMBER' },
    })
    const statuts = async () =>
      Object.fromEntries(
        (
          await testApp.app.inject({
            method: 'GET',
            url: adminUrl(establishmentId, '/members'),
            cookies,
          })
        )
          .json()
          .map((m: { user: { email: string; invitationStatus: string } }) => [
            m.user.email,
            m.user.invitationStatus,
          ]),
      )

    expect(await statuts()).toEqual({
      'admin@lilas.fr': null,
      'invitee@lilas.fr': 'pending',
    })
    const link = await testDb.accessLink.findFirstOrThrow()
    const days =
      (link.expiresAt.getTime() - link.createdAt.getTime()) / 86_400_000
    expect(Math.round(days)).toBe(30)

    await testDb.accessLink.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect((await statuts())['invitee@lilas.fr']).toBe('expired')

    await testDb.accessLink.updateMany({
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    })
    const reissued = await testApp.app.inject({
      method: 'POST',
      url: adminUrl(
        establishmentId,
        `/members/${created.json().member.id}/access-link`,
      ),
      cookies,
    })
    expect(reissued.statusCode).toBe(201)
    expect((await statuts())['invitee@lilas.fr']).toBe('pending')

    await setPasswordAndSignIn(
      tokenOf(sent[sent.length - 1].mail),
      'invitee@lilas.fr',
    )
    expect((await statuts())['invitee@lilas.fr']).toBeNull()
  })

  it('mot de passe oublie : meme reponse que l adresse existe ou non, lien d une heure', async () => {
    await createUser({ email: 'oubli@lilas.fr' })

    const inconnue = await testApp.app.inject({
      method: 'POST',
      url: '/auth/password-forgot',
      payload: { email: 'personne@lilas.fr' },
    })
    const connue = await testApp.app.inject({
      method: 'POST',
      url: '/auth/password-forgot',
      payload: { email: 'oubli@lilas.fr' },
    })
    await waitForMail()

    expect(inconnue.statusCode).toBe(204)
    expect(connue.statusCode).toBe(204)
    expect(inconnue.body).toBe(connue.body)
    expect(sent).toHaveLength(1)
    expect(sent[0].kind).toBe('password-reset')
    expect(sent[0].mail.to).toBe('oubli@lilas.fr')

    const link = await testDb.accessLink.findFirstOrThrow()
    const validityMs = link.expiresAt.getTime() - link.createdAt.getTime()
    expect(Math.round(validityMs / 60_000)).toBe(60)

    await setPasswordAndSignIn(tokenOf(sent[0].mail), 'oubli@lilas.fr')
  })

  it('mot de passe oublie : un compte desactive ne recoit rien', async () => {
    const user = await createUser({ email: 'parti@lilas.fr' })
    await testDb.user.update({
      where: { id: user.id },
      data: { deactivatedAt: new Date() },
    })

    await testApp.instances.accessLinkDomain.requestPasswordReset(
      'parti@lilas.fr',
    )

    expect(sent).toEqual([])
    expect(await testDb.accessLink.count()).toBe(0)
  })
})
