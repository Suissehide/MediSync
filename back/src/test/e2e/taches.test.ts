import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

type Cookies = { access_token: string }

describe('taches partagees et mentions', () => {
  let t: TestApp
  let E: string
  let A: string
  let B: string
  let claire: string
  let leo: string
  let lecteur: string
  let ancien: string
  let psychologue: string
  let psychologueArchive: string
  let psychologueB: string
  let claireC: Cookies
  let leoC: Cookies
  let lecteurC: Cookies

  const call = (
    c: Cookies,
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: object,
  ) =>
    t.app.inject({ method, url, cookies: c, ...(payload ? { payload } : {}) })

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    const est = await createEstablishment()
    E = est.id
    A = (await createService(E, 'Cardio')).id
    B = (await createService(E, 'Diabeto')).id
    psychologue = (
      await testDb.soignant.create({
        data: { name: 'Psychologue', establishmentId: E, serviceId: A },
      })
    ).id
    psychologueArchive = (
      await testDb.soignant.create({
        data: {
          name: 'Psychologue archivé',
          establishmentId: E,
          serviceId: A,
          archivedAt: new Date(),
        },
      })
    ).id
    psychologueB = (
      await testDb.soignant.create({
        data: { name: 'Psychologue B', establishmentId: E, serviceId: B },
      })
    ).id
    const membre = (
      serviceId: string,
      role: 'INTERVENANT' | 'LECTURE',
      soignantId?: string,
    ) => [{ establishmentId: E, services: [{ serviceId, role, soignantId }] }]
    leo = (
      await createUser({
        email: 'leo@t.fr',
        memberships: membre(A, 'INTERVENANT', psychologue),
      })
    ).id
    claire = (
      await createUser({
        email: 'claire@t.fr',
        memberships: membre(A, 'INTERVENANT', psychologue),
      })
    ).id
    lecteur = (
      await createUser({
        email: 'lecteur@t.fr',
        memberships: membre(A, 'LECTURE', psychologue),
      })
    ).id
    ancien = (
      await createUser({
        email: 'ancien@t.fr',
        memberships: membre(A, 'INTERVENANT'),
      })
    ).id
    await testDb.user.update({
      where: { id: ancien },
      data: { deactivatedAt: new Date() },
    })
    await createUser({ email: 'b@t.fr', memberships: membre(B, 'INTERVENANT') })
    leoC = await signIn(t.app, 'leo@t.fr')
    claireC = await signIn(t.app, 'claire@t.fr')
    lecteurC = await signIn(t.app, 'lecteur@t.fr')
  })

  afterAll(async () => {
    await t.close()
  })

  it('cree une tache avec mention : la notification part chez la taguee, pas chez l auteur', async () => {
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: '  Rappeler le labo  ',
      assigneeIds: [claire, leo],
      dueDate: '2026-10-22',
    })
    expect(res.statusCode).toBe(201)
    const tache = res.json()
    expect(tache).toMatchObject({
      text: 'Rappeler le labo',
      authorId: leo,
      dueDate: '2026-10-22',
      doneAt: null,
      patient: null,
    })
    expect(tache.assigneeIds.sort()).toEqual([claire, leo].sort())

    const deClaire = (
      await call(claireC, 'GET', tenantUrl(E, A, '/notifications'))
    ).json()
    expect(deClaire).toHaveLength(1)
    expect(deClaire[0]).toMatchObject({
      type: 'MENTION',
      readAt: null,
      payload: { taskId: tache.id, authorId: leo, text: 'Rappeler le labo' },
    })
    expect(
      (await call(leoC, 'GET', tenantUrl(E, A, '/notifications'))).json(),
    ).toEqual([])
  })

  it('@Psychologue seul : notifie les deux psychologues actifs, pas le LECTURE ni l auteur', async () => {
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: 'Voir le psychologue',
      soignantIds: [psychologue],
    })
    expect(res.statusCode).toBe(201)
    const tache = res.json()
    expect(tache.soignantIds).toEqual([psychologue])
    expect(tache.assigneeIds).toEqual([])

    const deClaire = (
      await call(claireC, 'GET', tenantUrl(E, A, '/notifications'))
    ).json()
    expect(
      deClaire.filter(
        (n: { payload: { taskId: string } }) => n.payload.taskId === tache.id,
      ),
    ).toHaveLength(1)
    expect(
      (await call(leoC, 'GET', tenantUrl(E, A, '/notifications')))
        .json()
        .filter(
          (n: { payload: { taskId: string } }) => n.payload.taskId === tache.id,
        ),
    ).toHaveLength(0)
    expect(
      (await call(lecteurC, 'GET', tenantUrl(E, A, '/notifications')))
        .json()
        .filter(
          (n: { payload: { taskId: string } }) => n.payload.taskId === tache.id,
        ),
    ).toHaveLength(0)
  })

  it('personne et metier recouvrants : une seule notification pour Claire', async () => {
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: 'Pour Claire, psychologue',
      assigneeIds: [claire],
      soignantIds: [psychologue],
    })
    expect(res.statusCode).toBe(201)
    const tache = res.json()
    const deClaire = (
      await call(claireC, 'GET', tenantUrl(E, A, '/notifications'))
    )
      .json()
      .filter(
        (n: { payload: { taskId: string } }) => n.payload.taskId === tache.id,
      )
    expect(deClaire).toHaveLength(1)
  })

  it.each([
    ['archive', () => psychologueArchive],
    ["d'un autre service", () => psychologueB],
    ['inconnu du service', () => 'cl_inconnu_du_service_00000'],
  ])('refuse un soignant %s, sans rien creer', async (_, id) => {
    const taches = await testDb.task.count()
    const notifs = await testDb.notification.count()
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: 'x',
      soignantIds: [id()],
    })
    expect(res.statusCode).toBe(400)
    expect(await testDb.task.count()).toBe(taches)
    expect(await testDb.notification.count()).toBe(notifs)
  })

  it('GET /taches rend soignantIds', async () => {
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: 'Avec metier',
      soignantIds: [psychologue],
    })
    const liste = (await call(leoC, 'GET', tenantUrl(E, A, '/taches'))).json()
    const tache = liste.find((x: { id: string }) => x.id === res.json().id)
    expect(tache.soignantIds).toEqual([psychologue])
  })

  it('sans tague, l auteur est tague et personne n est notifie', async () => {
    const avant = await testDb.notification.count()
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: 'Pour moi',
      assigneeIds: [],
    })
    expect(res.json().assigneeIds).toEqual([leo])
    expect(await testDb.notification.count()).toBe(avant)
  })

  it.each([
    ['un compte LECTURE', () => lecteur],
    ['un compte desactive', () => ancien],
    ['un inconnu du service', () => 'cl_inconnu_du_service_00000'],
  ])('refuse de taguer %s, sans rien creer', async (_, id) => {
    const taches = await testDb.task.count()
    const notifs = await testDb.notification.count()
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: 'x',
      assigneeIds: [id()],
    })
    expect(res.statusCode).toBe(400)
    expect(await testDb.task.count()).toBe(taches)
    expect(await testDb.notification.count()).toBe(notifs)
  })

  it('refuse un texte vide et un patient qui n est pas suivi dans le service', async () => {
    expect(
      (
        await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
          text: '   ',
          assigneeIds: [],
        })
      ).statusCode,
    ).toBe(400)
    const patient = await testDb.patient.create({
      data: {
        firstName: 'Ana',
        lastName: 'GARCIA',
        createDate: new Date(),
        establishmentId: E,
      },
    })
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: 'x',
      assigneeIds: [],
      patientId: patient.id,
    })
    expect(res.statusCode).toBe(400)
  })

  it('rend le patient lie, puis null une fois le patient supprime', async () => {
    const patient = await testDb.patient.create({
      data: {
        firstName: 'Paul',
        lastName: 'ROBERT',
        createDate: new Date(),
        establishmentId: E,
      },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, establishmentId: E, serviceId: A },
    })
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: 'Bilan',
      assigneeIds: [],
      patientId: patient.id,
    })
    expect(res.json().patient).toEqual({
      id: patient.id,
      firstName: 'Paul',
      lastName: 'ROBERT',
    })
    await testDb.patientServiceFile.deleteMany({
      where: { patientId: patient.id },
    })
    await testDb.patient.delete({ where: { id: patient.id } })
    const liste = (await call(leoC, 'GET', tenantUrl(E, A, '/taches'))).json()
    expect(
      liste.find((x: { id: string }) => x.id === res.json().id).patient,
    ).toBeNull()
  })

  it('coche et decoche ; masque les terminees de plus de 30 jours', async () => {
    const id = (
      await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
        text: 'Cocher',
        assigneeIds: [],
      })
    ).json().id
    const coche = await call(
      claireC,
      'PATCH',
      tenantUrl(E, A, `/taches/${id}`),
      { done: true },
    )
    expect(coche.json().doneAt).not.toBeNull()
    const decoche = await call(
      claireC,
      'PATCH',
      tenantUrl(E, A, `/taches/${id}`),
      { done: false },
    )
    expect(decoche.json().doneAt).toBeNull()

    const vieille = await testDb.task.create({
      data: {
        text: 'Vieille',
        establishmentId: E,
        serviceId: A,
        doneAt: new Date(Date.now() - 31 * 86_400_000),
      },
    })
    const ids = (await call(leoC, 'GET', tenantUrl(E, A, '/taches')))
      .json()
      .map((x: { id: string }) => x.id)
    expect(ids).toContain(id)
    expect(ids).not.toContain(vieille.id)
  })

  it('LECTURE : 403 sur les taches, 200 sur ses notifications', async () => {
    expect(
      (await call(lecteurC, 'GET', tenantUrl(E, A, '/taches'))).statusCode,
    ).toBe(403)
    expect(
      (await call(lecteurC, 'GET', tenantUrl(E, A, '/notifications')))
        .statusCode,
    ).toBe(200)
  })

  it('lu : 404 sur la notification d un autre ; tout-lu ne touche que les miennes', async () => {
    await call(claireC, 'POST', tenantUrl(E, A, '/taches'), {
      text: 'Pour Leo',
      assigneeIds: [leo],
    })
    await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: 'Pour Claire',
      assigneeIds: [claire],
    })
    const deLeo = (
      await call(leoC, 'GET', tenantUrl(E, A, '/notifications'))
    ).json()
    expect(
      (
        await call(
          claireC,
          'POST',
          tenantUrl(E, A, `/notifications/${deLeo[0].id}/lu`),
        )
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await call(
          leoC,
          'POST',
          tenantUrl(E, A, `/notifications/${deLeo[0].id}/lu`),
        )
      ).statusCode,
    ).toBe(204)

    expect(
      (await call(claireC, 'POST', tenantUrl(E, A, '/notifications/tout-lu')))
        .statusCode,
    ).toBe(204)
    const deClaire = (
      await call(claireC, 'GET', tenantUrl(E, A, '/notifications'))
    ).json()
    expect(
      deClaire.every((n: { readAt: string | null }) => n.readAt !== null),
    ).toBe(true)
    expect(
      await testDb.notification.count({ where: { userId: leo, readAt: null } }),
    ).toBe(0)
    await testDb.notification.updateMany({
      where: { userId: leo },
      data: { readAt: null },
    })
    await call(claireC, 'POST', tenantUrl(E, A, '/notifications/tout-lu'))
    expect(
      await testDb.notification.count({ where: { userId: leo, readAt: null } }),
    ).toBeGreaterThan(0)
  })

  it('masque les notifications de plus de 30 jours', async () => {
    const vieille = await testDb.notification.create({
      data: {
        establishmentId: E,
        serviceId: A,
        userId: claire,
        type: 'MENTION',
        payload: { taskId: 'x', authorId: leo, text: 'vieux' },
        createdAt: new Date(Date.now() - 31 * 86_400_000),
      },
    })
    const ids = (await call(claireC, 'GET', tenantUrl(E, A, '/notifications')))
      .json()
      .map((n: { id: string }) => n.id)
    expect(ids).not.toContain(vieille.id)
  })
})
