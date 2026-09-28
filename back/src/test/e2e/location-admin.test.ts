import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { adminUrl, createEstablishment, createService, createUser, signIn } from './setup/fixtures'

// Navigation par echelle (2026-09-28), tache 1 : l'ecran Salles quitte le prefixe de service pour
// l'administration d'etablissement. Il lui faut donc une liste lisible SANS service en contexte :
// un administrateur sans aucune affectation de service est precisement le compte que l'ancien
// emplacement laissait a la porte.
describe('GET /e/:id/admin/location', () => {
  let t: TestApp

  beforeAll(async () => {
    t = await buildTestApp()
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  beforeEach(truncateAll)

  it('liste les salles de l etablissement a un administrateur sans service, jamais celles d un autre', async () => {
    const est = await createEstablishment('E1')
    const other = await createEstablishment('E2')
    await createUser({
      email: 'admin@test.fr',
      memberships: [{ establishmentId: est.id, role: 'ADMIN' }],
    })
    const cookies = await signIn(t.app, 'admin@test.fr')
    const own = await testDb.location.create({ data: { establishmentId: est.id, name: 'Salle 1' } })
    const foreign = await testDb.location.create({
      data: { establishmentId: other.id, name: 'Salle etrangere' },
    })

    const res = await t.app.inject({ method: 'GET', url: adminUrl(est.id, '/location'), cookies })

    expect(res.statusCode).toBe(200)
    const ids = (res.json() as { id: string }[]).map((l) => l.id)
    expect(ids).toEqual([own.id])
    expect(ids).not.toContain(foreign.id)
  })

  it('refuse un coordinateur, qui n est pas administrateur de l etablissement', async () => {
    const est = await createEstablishment('E1')
    const service = await createService(est.id, 'S')
    await createUser({
      email: 'coord@test.fr',
      memberships: [
        { establishmentId: est.id, services: [{ serviceId: service.id, role: 'COORDINATEUR' }] },
      ],
    })
    const cookies = await signIn(t.app, 'coord@test.fr')

    const res = await t.app.inject({ method: 'GET', url: adminUrl(est.id, '/location'), cookies })

    // 404 et non 403 : le prefixe d'administration ne se resout que pour un administrateur de
    // l'etablissement (`resolveEstablishmentAdmin`), comme pour Membres ou Services.
    expect(res.statusCode).toBe(404)
  })
})
