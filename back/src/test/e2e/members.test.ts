import { hashPassword } from '../../main/utils/hash'
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'

const password = 'Motdepasse1!'

describe('routes membres (smoke)', () => {
  let testApp: TestApp
  let cookie: string
  let establishmentId: string
  let serviceId: string
  let soignantId: string

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
    await testDb.establishmentMembership.create({
      data: { userId: admin.id, establishmentId, role: 'ADMIN' },
    })
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

  it('refuse un e-mail inconnu, un service etranger et le retrait de soi-meme', async () => {
    expect(
      (await call('POST', '/', { email: 'zz@b.fr', role: 'MEMBER' }))
        .statusCode,
    ).toBe(404)
    const list = await call('GET', '/')
    const selfId = list.json()[0].id as string
    expect((await call('DELETE', `/${selfId}`)).statusCode).toBe(409)
    expect((await call('POST', `/${selfId}/deactivate`)).statusCode).toBe(409)
    expect(
      (await call('PATCH', `/${selfId}`, { role: 'MEMBER' })).statusCode,
    ).toBe(409)
  })
})
