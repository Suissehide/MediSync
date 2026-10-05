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

describe('indicateurs ARS', () => {
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

  const lire = async (serviceId: string) =>
    t.app.inject({
      method: 'GET',
      url: tenantUrl(
        establishmentId,
        serviceId,
        '/indicateurs-ars?from=2026-01-01&to=2026-12-31',
      ),
      cookies,
    })

  // Une séance individuelle honorée dans `serviceId`, pour `patientId`.
  const seanceHonoree = async (serviceId: string, patientId: string) => {
    const template = await testDb.slotTemplate.create({
      data: {
        startTime: new Date(),
        endTime: new Date(),
        offsetDays: 0,
        isIndividual: true,
        color: '#fff',
        serviceId,
        establishmentId,
      },
    })
    const slot = await testDb.slot.create({
      data: {
        startDate: new Date('2026-06-01T09:00:00Z'),
        endDate: new Date('2026-06-01T10:00:00Z'),
        serviceId,
        establishmentId,
        slotTemplateID: template.id,
      },
    })
    const appointment = await testDb.appointment.create({
      data: {
        startDate: new Date('2026-06-01T09:00:00Z'),
        endDate: new Date('2026-06-01T10:00:00Z'),
        type: 'ambulatory',
        serviceId,
        establishmentId,
        slotID: slot.id,
      },
    })
    await testDb.appointmentPatient.create({
      data: {
        appointmentId: appointment.id,
        patientId,
        serviceId,
        establishmentId,
        status: 'yes',
      },
    })
  }

  const indicateur = (res: Awaited<ReturnType<typeof lire>>, code: string) =>
    res.json().indicators.find((i: { code: string }) => i.code === code) as {
      value: number | null
    }

  // Review Focus 5, pour de vrai : le MÊME patient est suivi dans A et dans B, avec une séance
  // honorée de chaque côté. Chaque service doit voir UNE séance, pas deux. La version précédente
  // de ce cas ne créait le dossier que dans B : la cohorte de A était vide et `1.1 = 0` était vrai
  // quoi qu'il advienne du `where: { serviceId }` — elle ne touchait jamais le mécanisme.
  it('ne compte pas les seances du meme patient dans un autre service', async () => {
    const patient = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Camille',
        lastName: 'Durand',
        createDate: new Date(),
      },
    })
    for (const serviceId of [serviceA, serviceB]) {
      await testDb.patientServiceFile.create({
        data: {
          establishmentId,
          serviceId,
          patientId: patient.id,
          entryDate: new Date('2026-03-01'),
        },
      })
      await seanceHonoree(serviceId, patient.id)
    }

    const vuDeA = await lire(serviceA)
    const vuDeB = await lire(serviceB)

    expect(vuDeA.statusCode).toBe(200)
    expect(indicateur(vuDeA, '2.6').value).toBe(1)
    expect(indicateur(vuDeB, '2.6').value).toBe(1)
    // Le patient est entré dans les deux services : chacun le compte une fois, pas deux.
    expect(indicateur(vuDeA, '1.1').value).toBe(1)
  })

  it('rend les 30 indicateurs', async () => {
    const res = await lire(serviceA)
    expect(res.statusCode).toBe(200)
    expect(res.json().indicators).toHaveLength(30)
  })

  // Review Focus 3 : une période à l'envers est refusée, pas rendue vide en silence.
  it('refuse une periode dont la fin precede le debut', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: tenantUrl(
        establishmentId,
        serviceA,
        '/indicateurs-ars?from=2026-12-31&to=2026-01-01',
      ),
      cookies,
    })
    expect(res.statusCode).toBe(400)
  })

  it('rend un classeur nomme par le service et la periode', async () => {
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
    expect(res.headers['content-type']).toContain('spreadsheetml')
    expect(res.rawPayload.length).toBeGreaterThan(0)
    expect(res.headers['content-disposition']).toContain(
      'indicateurs-ars_2026-01-01_2026-12-31.xlsx',
    )

    // Le contenu, pas seulement l'en-tête HTTP : le service, la période et les 30 lignes.
    const feuille = XLSX.read(res.rawPayload, { type: 'buffer' })
    const nomFeuille = feuille.SheetNames[0]
    expect(nomFeuille).toBe('Indicateurs ARS')
    const lignes = XLSX.utils.sheet_to_json<Record<string, string>>(
      feuille.Sheets[nomFeuille],
    )
    expect(lignes[0]).toMatchObject({ Code: 'Service', Libellé: 'Service A' })
    expect(lignes[1]).toMatchObject({
      Code: 'Période',
      Libellé: '2026-01-01 au 2026-12-31',
    })
    expect(lignes.filter((l) => /^\d/.test(l.Code ?? ''))).toHaveLength(30)
  })

  // L'exigence centrale du ticket : chiffres agrégés, aucune donnée nominative. Le classeur est un
  // Buffer, donc le crochet `preSerialization` qui filtre le clinique ne s'y applique pas — c'est
  // ici, et nulle part ailleurs, que la propriété se vérifie sur ce chemin.
  it('ne laisse passer aucun nom de patient dans le classeur', async () => {
    const patient = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Nominatif',
        lastName: 'Interdit',
        createDate: new Date(),
      },
    })
    await testDb.patientServiceFile.create({
      data: {
        establishmentId,
        serviceId: serviceA,
        patientId: patient.id,
        entryDate: new Date('2026-04-01'),
        notes: 'NOTE-CLINIQUE-SECRETE',
      },
    })
    await seanceHonoree(serviceA, patient.id)

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
    // On assère sur la LISTE des termes trouvés, pas sur le classeur : un `not.toContain` sur le
    // binaire déverserait tout le fichier dans le rapport au premier échec.
    const texte = res.rawPayload.toString('latin1')
    const interdits = [
      'Nominatif',
      'Interdit',
      'NOTE-CLINIQUE-SECRETE',
      patient.id,
    ]
    expect(interdits.filter((terme) => texte.includes(terme))).toEqual([])
  })
})
