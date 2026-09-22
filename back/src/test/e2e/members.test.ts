import { hashPassword } from '../../main/utils/hash'
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'

const password = 'Motdepasse1!'

// Les deux regles metier rendent toutes deux un 409 : on verrouille donc le
// message, sans quoi un test ne saurait pas laquelle s'est declenchee.
const LAST_ADMIN = 'Cannot remove the last administrator'
const SELF = 'Cannot apply this action to your own account'

describe('routes membres', () => {
  let testApp: TestApp
  let cookie: string
  let establishmentId: string
  let serviceId: string
  let soignantId: string
  let selfMembershipId: string

  beforeAll(async () => {
    await truncateAll()
    const { hash, salt } = hashPassword(password)
    const establishment = await testDb.establishment.create({
      data: { name: 'E' },
    })
    establishmentId = establishment.id
    const service = await testDb.service.create({
      data: { establishmentId, name: 'S' },
    })
    serviceId = service.id
    const soignant = await testDb.soignant.create({
      data: { establishmentId, name: 'So' },
    })
    soignantId = soignant.id

    const admin = await testDb.user.create({
      data: {
        email: 'admin@b.fr',
        password: hash,
        salt,
        firstName: 'A',
        lastName: 'D',
      },
    })
    // Le compte administrateur est aussi coordinateur du service : c'est ce
    // qui lui permet d'atteindre le journal d'activite, monte sous le prefixe
    // de service.
    const membership = await testDb.establishmentMembership.create({
      data: {
        userId: admin.id,
        establishmentId,
        role: 'ADMIN',
        serviceMemberships: {
          create: [{ establishmentId, serviceId, role: 'COORDINATEUR' }],
        },
      },
    })
    selfMembershipId = membership.id
    await testDb.user.create({
      data: {
        email: 'new@b.fr',
        password: hash,
        salt,
        firstName: 'N',
        lastName: 'W',
      },
    })

    testApp = await buildTestApp()
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: 'admin@b.fr', password },
    })
    expect(res.statusCode).toBe(200)
    cookie = (res.cookies as { name: string; value: string }[])
      .map((c) => `${c.name}=${c.value}`)
      .join('; ')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) =>
    testApp.app.inject({
      method,
      url: `/e/${establishmentId}/admin/members${url}`,
      headers: { cookie },
      payload: payload as never,
    })

  const addSecondAdmin = async () => {
    const res = await call('POST', '/', { email: 'new@b.fr', role: 'ADMIN' })
    expect(res.statusCode).toBe(201)
    return res.json().id as string
  }

  it('liste, ajoute, met a jour, desactive, reactive et retire un membre', async () => {
    const list0 = await call('GET', '/')
    expect(list0.statusCode).toBe(200)
    expect(list0.json()).toHaveLength(1)

    const added = await call('POST', '/', {
      email: 'new@b.fr',
      role: 'MEMBER',
      soignantId,
      services: [{ serviceId, role: 'INTERVENANT' }],
    })
    expect(added.statusCode).toBe(201)
    const membershipId = added.json().id as string
    expect(added.json().serviceMemberships).toEqual([
      { serviceId, role: 'INTERVENANT' },
    ])

    const patched = await call('PATCH', `/${membershipId}`, {
      role: 'ADMIN',
      services: [{ serviceId, role: 'COORDINATEUR' }],
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().role).toBe('ADMIN')
    expect(patched.json().serviceMemberships).toEqual([
      { serviceId, role: 'COORDINATEUR' },
    ])

    const off = await call('POST', `/${membershipId}/deactivate`)
    expect(off.statusCode).toBe(200)
    expect(off.json().user.deactivatedAt).not.toBeNull()

    const on = await call('POST', `/${membershipId}/reactivate`)
    expect(on.statusCode).toBe(200)
    expect(on.json().user.deactivatedAt).toBeNull()

    const removed = await call('DELETE', `/${membershipId}`)
    expect(removed.statusCode).toBe(204)
    expect((await call('GET', '/')).json()).toHaveLength(1)
  })

  // Le journal est ecrit de façon asynchrone par le souscripteur : on laisse
  // un court delai plutot que de supposer l'ecriture immediate.
  it('journalise les operations de gestion des membres', async () => {
    const read = async () => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const res = await testApp.app.inject({
          method: 'GET',
          url: `/e/${establishmentId}/s/${serviceId}/activity-log`,
          headers: { cookie },
        })
        expect(res.statusCode).toBe(200)
        const actions = (
          res.json().data as { action: string; entityType: string }[]
        )
          .filter((entry) => entry.entityType === 'member')
          .map((entry) => entry.action)
        if (actions.length >= 5) {
          return actions
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      return []
    }

    expect((await read()).sort()).toEqual([
      'member.added',
      'member.deactivated',
      'member.reactivated',
      'member.removed',
      'member.updated',
    ])
  })

  // Sinon un administrateur peut deviner quelles adresses ont un compte sur
  // la plateforme, en lisant la difference entre les deux refus.
  it('rend le meme refus pour une adresse inconnue et une adresse deja membre', async () => {
    const unknownEmail = await call('POST', '/', {
      email: 'inconnu@b.fr',
      role: 'MEMBER',
    })
    const alreadyMember = await call('POST', '/', {
      email: 'admin@b.fr',
      role: 'MEMBER',
    })

    expect(unknownEmail.statusCode).toBe(alreadyMember.statusCode)
    expect(unknownEmail.json()).toEqual(alreadyMember.json())
    expect(unknownEmail.statusCode).toBe(400)
  })

  it('refuse un soignant etranger et deux affectations au meme service', async () => {
    const foreignSoignant = await testDb.soignant.create({
      data: {
        establishmentId: (
          await testDb.establishment.create({ data: { name: 'Autre' } })
        ).id,
        name: 'Etranger',
      },
    })
    expect(
      (
        await call('POST', '/', {
          email: 'new@b.fr',
          role: 'MEMBER',
          soignantId: foreignSoignant.id,
        })
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await call('POST', '/', {
          email: 'new@b.fr',
          role: 'MEMBER',
          services: [
            { serviceId, role: 'LECTURE' },
            { serviceId, role: 'COORDINATEUR' },
          ],
        })
      ).statusCode,
    ).toBe(400)
  })

  // Un seul administrateur, et `update` ne verifie pas la regle du soi-meme :
  // seule la regle du dernier administrateur peut se declencher ici.
  it('refuse de retrograder le dernier administrateur', async () => {
    const res = await call('PATCH', `/${selfMembershipId}`, { role: 'MEMBER' })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toBe(LAST_ADMIN)
  })

  // Deux administrateurs actifs : la regle du dernier administrateur ne peut
  // pas se declencher, seule celle du soi-meme le peut.
  it('refuse de se retirer et de se desactiver soi-meme meme quand un autre administrateur subsiste', async () => {
    const secondAdmin = await addSecondAdmin()

    const removed = await call('DELETE', `/${selfMembershipId}`)
    expect(removed.statusCode).toBe(409)
    expect(removed.json().message).toBe(SELF)

    const off = await call('POST', `/${selfMembershipId}/deactivate`)
    expect(off.statusCode).toBe(409)
    expect(off.json().message).toBe(SELF)

    expect((await call('DELETE', `/${secondAdmin}`)).statusCode).toBe(204)
  })

  // `User.deactivatedAt` porte sur l'identite globale : la changer depuis un
  // etablissement couperait aussi les autres.
  it('refuse de changer l activation d un compte appartenant a plusieurs etablissements', async () => {
    const membershipId = await addSecondAdmin()
    const other = await testDb.establishment.create({
      data: { name: 'Ailleurs' },
    })
    const account = await testDb.user.findUniqueOrThrow({
      where: { email: 'new@b.fr' },
    })
    await testDb.establishmentMembership.create({
      data: { userId: account.id, establishmentId: other.id, role: 'MEMBER' },
    })

    for (const action of ['deactivate', 'reactivate']) {
      const res = await call('POST', `/${membershipId}/${action}`)
      expect(res.statusCode).toBe(409)
      expect(res.json().message).toContain('several establishments')
    }
  })
})
