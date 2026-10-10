import * as XLSX from 'xlsx'

import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

type Indicateur = {
  code: string
  answer: {
    numberValue: number | null
    textValue: string | null
    boolValue: boolean | null
  } | null
}

describe('indicateurs ARS : reponses saisies', () => {
  let t: TestApp
  let establishmentId: string
  let serviceA: string
  let serviceB: string
  let cookies: { access_token: string }

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    const est = await createEstablishment()
    establishmentId = est.id
    serviceA = (await createService(est.id, 'Service A')).id
    serviceB = (await createService(est.id, 'Service B')).id
    await createUser({
      email: 'coordo@test.fr',
      memberships: [
        {
          establishmentId,
          services: [
            { serviceId: serviceA, role: 'COORDINATEUR' },
            { serviceId: serviceB, role: 'COORDINATEUR' },
          ],
        },
      ],
    })
    cookies = await signIn(t.app, 'coordo@test.fr')
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  const saisir = (
    serviceId: string,
    year: number | string,
    code: string,
    payload: unknown,
  ) =>
    t.app.inject({
      method: 'PUT',
      url: tenantUrl(
        establishmentId,
        serviceId,
        `/indicateurs-ars/saisies/${year}/${code}`,
      ),
      cookies,
      payload: payload as never,
    })

  const lire = (serviceId: string, from: string, to: string) =>
    t.app.inject({
      method: 'GET',
      url: tenantUrl(
        establishmentId,
        serviceId,
        `/indicateurs-ars?from=${from}&to=${to}`,
      ),
      cookies,
    })

  const reponse = (res: Awaited<ReturnType<typeof lire>>, code: string) =>
    (res.json().indicators as Indicateur[]).find((i) => i.code === code)?.answer

  it('enregistre 2.5 et 4.2 et les rend pour l annee civile', async () => {
    const r25 = await saisir(serviceA, 2026, '2.5', {
      numberValue: 12,
      textValue: 'Ateliers en ville',
    })
    expect(r25.statusCode).toBe(200)
    expect(r25.json()).toEqual({
      numberValue: 12,
      textValue: 'Ateliers en ville',
      boolValue: null,
    })
    const r42 = await saisir(serviceA, 2026, '4.2', { boolValue: true })
    expect(r42.statusCode).toBe(200)

    const res = await lire(serviceA, '2026-01-01', '2026-12-31')
    expect(res.statusCode).toBe(200)
    expect(res.json().manualYear).toBe(2026)
    expect(reponse(res, '2.5')).toEqual({
      numberValue: 12,
      textValue: 'Ateliers en ville',
      boolValue: null,
    })
    expect(reponse(res, '4.2')).toEqual({
      numberValue: null,
      textValue: null,
      boolValue: true,
    })
    expect(reponse(res, '1.1')).toBeNull()
  })

  // Review Focus 1 : hors annee civile, ni saisie ni reponse jointe.
  it('ne joint rien hors annee civile complete', async () => {
    const res = await lire(serviceA, '2026-03-01', '2026-09-30')
    expect(res.json().manualYear).toBeNull()
    expect(reponse(res, '2.5')).toBeNull()
    expect(reponse(res, '4.2')).toBeNull()

    const autreAnnee = await lire(serviceA, '2025-01-01', '2025-12-31')
    expect(autreAnnee.json().manualYear).toBe(2025)
    expect(reponse(autreAnnee, '2.5')).toBeNull()
  })

  // Review Focus 3 : code non saisissable ou champ d'un autre type.
  it('refuse un code calcule ou un champ du mauvais type', async () => {
    expect(
      (await saisir(serviceA, 2026, '1.1', { numberValue: 1 })).statusCode,
    ).toBe(400)
    expect(
      (await saisir(serviceA, 2026, '2.5', { boolValue: true })).statusCode,
    ).toBe(400)
    expect(
      (await saisir(serviceA, 2026, '4.2', { numberValue: 3 })).statusCode,
    ).toBe(400)
    expect(
      (await saisir(serviceA, 2026, '2.5', { numberValue: -1 })).statusCode,
    ).toBe(400)
    expect(
      (await saisir(serviceA, 1999, '4.2', { boolValue: true })).statusCode,
    ).toBe(400)
  })

  it('refuse un code herite de Object.prototype sans rien ecrire', async () => {
    for (const code of ['constructor', 'toString']) {
      expect(
        (
          await saisir(serviceA, 2026, code, {
            numberValue: 1,
            textValue: null,
          })
        ).statusCode,
      ).toBe(400)
    }
    expect(
      await testDb.arsManualAnswer.count({
        where: { code: { in: ['constructor', 'toString'] } },
      }),
    ).toBe(0)
  })

  // Review Focus 4 : chaque service lit la sienne.
  it('isole les reponses par service', async () => {
    expect(
      (await saisir(serviceB, 2026, '2.5', { numberValue: 3, textValue: null }))
        .statusCode,
    ).toBe(200)
    const a = await lire(serviceA, '2026-01-01', '2026-12-31')
    const b = await lire(serviceB, '2026-01-01', '2026-12-31')
    expect(reponse(a, '2.5')?.numberValue).toBe(12)
    expect(reponse(b, '2.5')?.numberValue).toBe(3)
    expect(reponse(b, '4.2')).toBeNull()
  })

  it('met a jour sans doublon', async () => {
    await saisir(serviceA, 2026, '2.5', { numberValue: 7, textValue: null })
    await saisir(serviceA, 2026, '2.5', {
      numberValue: 12,
      textValue: 'Ateliers en ville',
    })
    const lignes = await testDb.arsManualAnswer.findMany({
      where: { serviceId: serviceA, year: 2026, code: '2.5' },
    })
    expect(lignes).toHaveLength(1)
    expect(lignes[0]).toMatchObject({ numberValue: 12 })
  })

  it('porte les reponses dans le classeur', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: tenantUrl(
        establishmentId,
        serviceA,
        '/indicateurs-ars/export?from=2026-01-01&to=2026-12-31',
      ),
      cookies,
    })
    expect(res.statusCode).toBe(200)
    const feuille = XLSX.read(res.rawPayload, { type: 'buffer' })
    const lignes = XLSX.utils.sheet_to_json<Record<string, string | number>>(
      feuille.Sheets['Indicateurs ARS'] as XLSX.WorkSheet,
    )
    const l25 = lignes.find((l) => l.Code === '2.5')
    const l42 = lignes.find((l) => l.Code === '4.2')
    expect(l25?.Valeur).toBe(12)
    expect(String(l25?.Libellé)).toMatch(/ — Ateliers en ville$/)
    expect(l42?.Valeur).toBe('Oui')
  })

  // Une reponse enregistree mais vide (bascule remise a vide, nombre efface sans texte) retombe
  // sur la note de l'indicateur, comme une absence totale de reponse.
  it('retombe sur la note de l indicateur quand la reponse enregistree est vide', async () => {
    await saisir(serviceB, 2026, '2.5', { numberValue: null, textValue: null })
    await saisir(serviceB, 2026, '4.2', { boolValue: null })

    const res = await t.app.inject({
      method: 'GET',
      url: tenantUrl(
        establishmentId,
        serviceB,
        '/indicateurs-ars/export?from=2026-01-01&to=2026-12-31',
      ),
      cookies,
    })
    expect(res.statusCode).toBe(200)
    const feuille = XLSX.read(res.rawPayload, { type: 'buffer' })
    const lignes = XLSX.utils.sheet_to_json<Record<string, string | number>>(
      feuille.Sheets['Indicateurs ARS'] as XLSX.WorkSheet,
    )
    const l25 = lignes.find((l) => l.Code === '2.5')
    const l42 = lignes.find((l) => l.Code === '4.2')
    expect(l25?.Valeur).toBe("Champ libre de l'enquête, à renseigner à la main")
    expect(l42?.Valeur).toBe(
      'Question oui/non sur la structure, à renseigner à la main',
    )
  })
})
