import { buildTestApp, type TestApp } from './setup/app'
import { truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
} from './setup/fixtures'

describe('preferences de notification', () => {
  let t: TestApp
  let A: string
  let B: string
  let cookies: { access_token: string }

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    const e = await createEstablishment()
    A = (await createService(e.id, 'Cardio')).id
    B = (await createService(e.id, 'Diabeto')).id
    const autre = await createEstablishment('Autre')
    const C = (await createService(autre.id, 'Ailleurs')).id
    void C
    await createUser({
      email: 'leo@t.fr',
      memberships: [
        {
          establishmentId: e.id,
          services: [
            { serviceId: A, role: 'INTERVENANT' },
            { serviceId: B, role: 'INTERVENANT' },
          ],
        },
      ],
    })
    cookies = await signIn(t.app, 'leo@t.fr')
  })

  afterAll(async () => {
    await t.close()
  })

  const get = () =>
    t.app.inject({
      method: 'GET',
      url: '/me/notification-preferences',
      cookies,
    })
  const put = (payload: object) =>
    t.app.inject({
      method: 'PUT',
      url: '/me/notification-preferences',
      cookies,
      payload,
    })

  it('rend le defaut pour un compte qui n a rien choisi', async () => {
    const res = await get()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      level: 'essential',
      services: null,
      reminderDelay: 'eve',
    })
  })

  it('enregistre et relit', async () => {
    const prefs = {
      level: 'custom',
      services: [A],
      reminderDelay: '2h',
      app: {
        reminder: true,
        added: false,
        moved: true,
        absent: true,
        diag: true,
        end: true,
        full: false,
        mention: true,
        due: true,
      },
    }
    expect((await put(prefs)).statusCode).toBe(200)
    expect((await get()).json()).toEqual(prefs)
  })

  it('refuse aucun service et un service qui n est pas au compte', async () => {
    const base = {
      level: 'essential',
      reminderDelay: 'eve',
      app: {
        reminder: true,
        added: true,
        moved: true,
        absent: true,
        diag: true,
        end: true,
        full: true,
        mention: true,
        due: true,
      },
    }
    expect((await put({ ...base, services: [] })).statusCode).toBe(400)
    expect(
      (await put({ ...base, services: ['cl_service_etranger_0000000'] }))
        .statusCode,
    ).toBe(400)
  })

  it('exige une session', async () => {
    expect(
      (
        await t.app.inject({
          method: 'GET',
          url: '/me/notification-preferences',
        })
      ).statusCode,
    ).toBe(401)
  })
})
