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

type Cookies = { access_token: string }

type IndicatorResponse = {
  id: string
  code: string
  label: string
  group: string
  order: number
  nature: string
  measure: string | null
  options: unknown
  filters: unknown
  breakdownField: string | null
  input: string | null
  note: string | null
  parentId: string | null
  archived: boolean
}

type IndicatorSetResponse = {
  id: string
  name: string
  order: number
  archived: boolean
  indicators: IndicatorResponse[]
}

type ServiceFieldChoiceResponse = { id: string; key: string; label: string }
type ServiceFieldResponse = {
  id: string
  key: string
  choices: ServiceFieldChoiceResponse[]
}

// Un etablissement, un service, un COORDINATEUR, un INTERVENANT et un LECTURE — une connexion
// par role (sign-in limite a 10/minute). Des champs crees par l'API du chantier 1 (comorbidites,
// orientation, motifArret, commentaire) servent aux filtres, a la repartition et aux reglages
// de l'Activite.
describe('configuration des jeux d indicateurs', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let coordinateurCookies: Cookies
  let intervenantCookies: Cookies
  let lectureCookies: Cookies

  const url = (path: string) => tenantUrl(establishmentId, serviceId, path)

  const createField = async (payload: Record<string, unknown>) => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: url('/service-fields'),
      cookies: coordinateurCookies,
      payload: { section: 'pathway', ...payload } as never,
    })
    expect(res.statusCode).toBe(201)
    return res.json() as ServiceFieldResponse
  }

  let comorbidites: ServiceFieldResponse
  let orientation: ServiceFieldResponse
  let motifArret: ServiceFieldResponse
  let commentaire: ServiceFieldResponse

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-INDICATEURS')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-INDICATEURS')
    serviceId = service.id

    for (const [email, role] of [
      ['coordinateur@indicateurs.fr', 'COORDINATEUR'],
      ['intervenant@indicateurs.fr', 'INTERVENANT'],
      ['lecture@indicateurs.fr', 'LECTURE'],
    ] as const) {
      await createUser({
        email,
        memberships: [{ establishmentId, services: [{ serviceId, role }] }],
      })
    }

    testApp = await buildTestApp()
    coordinateurCookies = await signIn(
      testApp.app,
      'coordinateur@indicateurs.fr',
    )
    intervenantCookies = await signIn(testApp.app, 'intervenant@indicateurs.fr')
    lectureCookies = await signIn(testApp.app, 'lecture@indicateurs.fr')

    comorbidites = await createField({
      label: 'Comorbidités',
      type: 'multichoice',
      choices: ['HTA', 'Diabète'],
    })
    orientation = await createField({
      label: 'Orientation',
      type: 'choice',
      choices: ['Hors hôpital', 'Hospitalisation', 'Consultation externe'],
    })
    motifArret = await createField({
      label: 'Motif arrêt',
      type: 'choice',
      choices: ['Autre', 'Fin de parcours'],
    })
    commentaire = await createField({ label: 'Commentaire', type: 'text' })
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  let setId: string
  let indicatorId: string
  let secondIndicatorId: string

  it('cree un jeu « Suivi diabète »', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: url('/indicator-sets'),
      cookies: coordinateurCookies,
      payload: { name: 'Suivi diabète' } as never,
    })
    expect(res.statusCode).toBe(201)
    const set = res.json() as IndicatorSetResponse
    expect(set.name).toBe('Suivi diabète')
    expect(set.archived).toBe(false)
    expect(set.indicators).toEqual([])
    setId = set.id
  })

  it('ajoute patientsEntres avec un filtre et une repartition : 201, relu a l identique', async () => {
    const hta = comorbidites.choices.find((c) => c.label === 'HTA')
    const res = await testApp.app.inject({
      method: 'POST',
      url: url(`/indicator-sets/${setId}/indicators`),
      cookies: coordinateurCookies,
      payload: {
        code: '1.1',
        label: 'Patients entrés',
        group: 'Entrée',
        nature: 'computed',
        measure: 'patientsEntres',
        filters: [
          { field: comorbidites.key, op: 'containsAny', value: [hta?.key] },
        ],
        breakdownField: orientation.key,
      } as never,
    })
    expect(res.statusCode).toBe(201)
    const indicator = res.json() as IndicatorResponse
    expect(indicator.code).toBe('1.1')
    expect(indicator.archived).toBe(false)
    indicatorId = indicator.id

    const liste = await testApp.app.inject({
      method: 'GET',
      url: url('/indicator-sets'),
      cookies: coordinateurCookies,
    })
    const set = (liste.json() as IndicatorSetResponse[]).find(
      (s) => s.id === setId,
    )
    expect(set?.indicators.find((i) => i.id === indicatorId)).toEqual(indicator)
  })

  it('un second indicateur, enfant du premier, se cree sans probleme', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: url(`/indicator-sets/${setId}/indicators`),
      cookies: coordinateurCookies,
      payload: {
        code: '1.1bis',
        label: 'Dont diagnostic à distance',
        group: 'Entrée',
        nature: 'manual',
        input: 'yesno',
        parentId: indicatorId,
      } as never,
    })
    expect(res.statusCode).toBe(201)
    secondIndicatorId = (res.json() as IndicatorResponse).id
  })

  it('un code en double dans le jeu est refuse : 400', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: url(`/indicator-sets/${setId}/indicators`),
      cookies: coordinateurCookies,
      payload: {
        code: '1.1',
        label: 'Doublon',
        group: 'Entrée',
        nature: 'manual',
        input: 'yesno',
      } as never,
    })
    expect(res.statusCode).toBe(400)
  })

  it('un parent appartenant a un autre jeu est refuse : 400', async () => {
    const autreJeu = await testApp.app.inject({
      method: 'POST',
      url: url('/indicator-sets'),
      cookies: coordinateurCookies,
      payload: { name: 'Autre jeu' } as never,
    })
    const autreIndicateur = await testApp.app.inject({
      method: 'POST',
      url: url(
        `/indicator-sets/${(autreJeu.json() as IndicatorSetResponse).id}/indicators`,
      ),
      cookies: coordinateurCookies,
      payload: {
        code: 'X',
        label: 'Ailleurs',
        group: 'G',
        nature: 'manual',
        input: 'yesno',
      } as never,
    })
    const res = await testApp.app.inject({
      method: 'POST',
      url: url(`/indicator-sets/${setId}/indicators`),
      cookies: coordinateurCookies,
      payload: {
        code: '1.2',
        label: 'Parent ailleurs',
        group: 'Entrée',
        nature: 'manual',
        input: 'yesno',
        parentId: (autreIndicateur.json() as IndicatorResponse).id,
      } as never,
    })
    expect(res.statusCode).toBe(400)
  })

  it('un cycle de parents est refuse : 400', async () => {
    const res = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/indicator-sets/${setId}/indicators/${indicatorId}`),
      cookies: coordinateurCookies,
      payload: { parentId: secondIndicatorId } as never,
    })
    expect(res.statusCode).toBe(400)
  })

  it('un refus de validateIndicator remonte en 400 avec son message', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: url(`/indicator-sets/${setId}/indicators`),
      cookies: coordinateurCookies,
      payload: {
        code: '1.3',
        label: 'Filtre invalide',
        group: 'Entrée',
        nature: 'computed',
        measure: 'patientsEntres',
        filters: [{ field: comorbidites.key, op: 'eq', value: true }],
      } as never,
    })
    expect(res.statusCode).toBe(400)
    expect(typeof res.json().message).toBe('string')
    expect((res.json() as { message: string }).message.length).toBeGreaterThan(
      0,
    )
  })

  it('archive un indicateur puis le restaure', async () => {
    const archive = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/indicator-sets/${setId}/indicators/${indicatorId}`),
      cookies: coordinateurCookies,
      payload: { archived: true } as never,
    })
    expect(archive.statusCode).toBe(200)
    expect((archive.json() as IndicatorResponse).archived).toBe(true)

    const liste = await testApp.app.inject({
      method: 'GET',
      url: url('/indicator-sets'),
      cookies: coordinateurCookies,
    })
    const set = (liste.json() as IndicatorSetResponse[]).find(
      (s) => s.id === setId,
    )
    expect(set?.indicators.map((i) => i.id)).toContain(indicatorId)

    const restaure = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/indicator-sets/${setId}/indicators/${indicatorId}`),
      cookies: coordinateurCookies,
      payload: { archived: false } as never,
    })
    expect(restaure.statusCode).toBe(200)
    expect((restaure.json() as IndicatorResponse).archived).toBe(false)
  })

  it('archive le jeu puis le restaure', async () => {
    const archive = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/indicator-sets/${setId}`),
      cookies: coordinateurCookies,
      payload: { archived: true } as never,
    })
    expect(archive.statusCode).toBe(200)
    expect((archive.json() as IndicatorSetResponse).archived).toBe(true)

    const restaure = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/indicator-sets/${setId}`),
      cookies: coordinateurCookies,
      payload: { archived: false } as never,
    })
    expect(restaure.statusCode).toBe(200)
    expect((restaure.json() as IndicatorSetResponse).archived).toBe(false)
  })

  it('reordonne les indicateurs du jeu : jeu complet exige', async () => {
    const liste = await testApp.app.inject({
      method: 'GET',
      url: url('/indicator-sets'),
      cookies: coordinateurCookies,
    })
    const set = (liste.json() as IndicatorSetResponse[]).find(
      (s) => s.id === setId,
    )
    const ids = (set?.indicators ?? []).map((i) => i.id)

    const partiel = await testApp.app.inject({
      method: 'PUT',
      url: url(`/indicator-sets/${setId}/indicators/order`),
      cookies: coordinateurCookies,
      payload: { ids: [ids[0]] } as never,
    })
    expect(partiel.statusCode).toBe(400)

    const complet = await testApp.app.inject({
      method: 'PUT',
      url: url(`/indicator-sets/${setId}/indicators/order`),
      cookies: coordinateurCookies,
      payload: { ids: [...ids].reverse() } as never,
    })
    expect(complet.statusCode).toBe(204)

    const relu = await testApp.app.inject({
      method: 'GET',
      url: url('/indicator-sets'),
      cookies: coordinateurCookies,
    })
    const setRelu = (relu.json() as IndicatorSetResponse[]).find(
      (s) => s.id === setId,
    )
    expect(
      [...(setRelu?.indicators ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((i) => i.id),
    ).toEqual([...ids].reverse())
  })

  it('le catalogue expose 12 mesures, patientsParModalite avec ses trois choix libelles', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: url('/indicator-catalog'),
      cookies: coordinateurCookies,
    })
    expect(res.statusCode).toBe(200)
    const catalogue = res.json() as {
      key: string
      options: {
        name: string
        kind: string
        choices?: { value: string; label: string }[]
      }[]
    }[]
    expect(catalogue).toHaveLength(12)
    const modalite = catalogue.find((m) => m.key === 'patientsParModalite')
    const option = modalite?.options.find((o) => o.name === 'modalite')
    expect(option?.kind).toBe('enum')
    expect(option?.choices).toHaveLength(3)
    expect(option?.choices?.every((c) => c.label.length > 0)).toBe(true)
  })

  it('reglages de l Activite : champ text refuse, choix inconnu refuse, couple valide accepte et relu', async () => {
    const champTexte = await testApp.app.inject({
      method: 'PATCH',
      url: url('/activity-settings'),
      cookies: coordinateurCookies,
      payload: {
        stopReasonFieldKey: commentaire.key,
        completedChoiceKey: null,
      } as never,
    })
    expect(champTexte.statusCode).toBe(400)

    const choixInconnu = await testApp.app.inject({
      method: 'PATCH',
      url: url('/activity-settings'),
      cookies: coordinateurCookies,
      payload: {
        stopReasonFieldKey: motifArret.key,
        completedChoiceKey: 'INCONNU',
      } as never,
    })
    expect(choixInconnu.statusCode).toBe(400)

    const finDeParcours = motifArret.choices.find(
      (c) => c.label === 'Fin de parcours',
    )
    const valide = await testApp.app.inject({
      method: 'PATCH',
      url: url('/activity-settings'),
      cookies: coordinateurCookies,
      payload: {
        stopReasonFieldKey: motifArret.key,
        completedChoiceKey: finDeParcours?.key,
      } as never,
    })
    expect(valide.statusCode).toBe(200)
    expect(valide.json()).toEqual({
      stopReasonFieldKey: motifArret.key,
      completedChoiceKey: finDeParcours?.key,
    })

    const service = await testDb.service.findUniqueOrThrow({
      where: { id: serviceId },
    })
    expect(service.stopReasonFieldKey).toBe(motifArret.key)
    expect(service.completedChoiceKey).toBe(finDeParcours?.key)
  })

  // Matrice reelle (back/src/main/utils/permissions.ts) : INTERVENANT et LECTURE ne detiennent
  // ni stats:read ni stats:write — a la difference de ce que le brief de tache 4 attendait
  // (« intervenant : 403 en ecriture, 200 en lecture »), voir le rapport de tache.
  it('intervenant et lecture recoivent 403 en lecture comme en ecriture', async () => {
    for (const cookies of [intervenantCookies, lectureCookies]) {
      const lecture = await testApp.app.inject({
        method: 'GET',
        url: url('/indicator-sets'),
        cookies,
      })
      expect(lecture.statusCode).toBe(403)

      const ecriture = await testApp.app.inject({
        method: 'POST',
        url: url('/indicator-sets'),
        cookies,
        payload: { name: 'X' } as never,
      })
      expect(ecriture.statusCode).toBe(403)
    }
  })

  it('isolation : le jeu d un autre service est invisible et inaccessible (404)', async () => {
    const serviceB = await createService(establishmentId, 'S-INDICATEURS-B')
    await createUser({
      email: 'coordinateur-b@indicateurs.fr',
      memberships: [
        {
          establishmentId,
          services: [{ serviceId: serviceB.id, role: 'COORDINATEUR' }],
        },
      ],
    })
    const cookiesB = await signIn(testApp.app, 'coordinateur-b@indicateurs.fr')
    const urlB = (path: string) => tenantUrl(establishmentId, serviceB.id, path)

    const liste = await testApp.app.inject({
      method: 'GET',
      url: urlB('/indicator-sets'),
      cookies: cookiesB,
    })
    expect(
      (liste.json() as IndicatorSetResponse[]).map((s) => s.id),
    ).not.toContain(setId)

    const patch = await testApp.app.inject({
      method: 'PATCH',
      url: urlB(`/indicator-sets/${setId}`),
      cookies: cookiesB,
      payload: { archived: true } as never,
    })
    expect(patch.statusCode).toBe(404)
  })

  it('relit les reglages de l Activite', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: url('/activity-settings'),
      cookies: coordinateurCookies,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      stopReasonFieldKey: motifArret.key,
      completedChoiceKey: motifArret.choices.find(
        (c) => c.label === 'Fin de parcours',
      )?.key,
    })
  })

  describe('résultats', () => {
    const cle = (field: ServiceFieldResponse, label: string): string => {
      const choice = field.choices.find((c) => c.label === label)
      if (!choice) {
        throw new Error(`choix ${label} absent`)
      }
      return choice.key
    }

    const dossier = async (
      entryDate: string,
      data: Record<string, string | string[]>,
    ) => {
      const patient = await testDb.patient.create({
        data: {
          establishmentId,
          firstName: 'Agrege',
          lastName: entryDate,
          createDate: new Date(),
        },
      })
      await testDb.patientServiceFile.create({
        data: {
          establishmentId,
          serviceId,
          patientId: patient.id,
          entryDate: new Date(entryDate),
          data,
        },
      })
    }

    beforeAll(async () => {
      await dossier('2026-03-01', {
        [comorbidites.key]: [cle(comorbidites, 'HTA')],
        [orientation.key]: cle(orientation, 'Hors hôpital'),
      })
      await dossier('2026-04-01', {
        [comorbidites.key]: [
          cle(comorbidites, 'HTA'),
          cle(comorbidites, 'Diabète'),
        ],
      })
      await dossier('2026-05-01', {
        [comorbidites.key]: [cle(comorbidites, 'Diabète')],
        [orientation.key]: cle(orientation, 'Hospitalisation'),
      })
    })

    const periode = 'from=2026-01-01&to=2026-12-31'

    it('calcule un indicateur filtre et reparti', async () => {
      const res = await testApp.app.inject({
        method: 'GET',
        url: url(`/indicator-sets/${setId}/results?${periode}`),
        cookies: coordinateurCookies,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().manualYear).toBe(2026)
      const entres = res
        .json()
        .indicators.find((i: { id: string }) => i.id === indicatorId)
      expect(entres).toMatchObject({
        code: '1.1',
        nature: 'computed',
        value: 2,
        warnings: [],
        breakdown: [
          { label: 'Hors hôpital', value: 1 },
          { label: 'Hospitalisation', value: 0 },
          { label: 'Consultation externe', value: 0 },
          { key: '__empty__', label: 'Non renseigné', value: 1 },
        ],
      })
    })

    it('apercoit un indicateur non enregistre', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: url(`/indicator-sets/${setId}/preview`),
        cookies: coordinateurCookies,
        payload: {
          indicator: {
            nature: 'computed',
            measure: 'patientsEntres',
            filters: [
              {
                field: comorbidites.key,
                op: 'containsAny',
                value: [cle(comorbidites, 'Diabète')],
              },
            ],
          },
          from: '2026-01-01',
          to: '2026-12-31',
        } as never,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ value: 2, breakdown: null, warnings: [] })
    })

    it('refuse l apercu d un filtre in vide : 400', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: url(`/indicator-sets/${setId}/preview`),
        cookies: coordinateurCookies,
        payload: {
          indicator: {
            nature: 'computed',
            measure: 'patientsEntres',
            filters: [{ field: orientation.key, op: 'in', value: [] }],
          },
          from: '2026-01-01',
          to: '2026-12-31',
        } as never,
      })
      expect(res.statusCode).toBe(400)
    })

    it('exporte la repartition sous l indicateur', async () => {
      const res = await testApp.app.inject({
        method: 'GET',
        url: url(`/indicator-sets/${setId}/export?${periode}`),
        cookies: coordinateurCookies,
      })
      expect(res.statusCode).toBe(200)
      const feuille = XLSX.read(res.rawPayload, { type: 'buffer' })
      const lignes = XLSX.utils.sheet_to_json<Record<string, string | number>>(
        feuille.Sheets[feuille.SheetNames[0] ?? ''] ?? {},
        { defval: '' },
      )
      const debut = lignes.findIndex((l) => l.Code === '1.1')
      expect(lignes.slice(debut, debut + 5)).toEqual([
        { Code: '1.1', Libellé: 'Patients entrés', Valeur: 2 },
        { Code: '', Libellé: '— Hors hôpital', Valeur: 1 },
        { Code: '', Libellé: '— Hospitalisation', Valeur: 0 },
        { Code: '', Libellé: '— Consultation externe', Valeur: 0 },
        { Code: '', Libellé: '— Non renseigné', Valeur: 1 },
      ])
    })

    it('refuse la saisie sur un indicateur d un autre jeu du meme service : 404', async () => {
      const autre = await testApp.app.inject({
        method: 'POST',
        url: url('/indicator-sets'),
        cookies: coordinateurCookies,
        payload: { name: 'Autre jeu' } as never,
      })
      const autreSetId = (autre.json() as IndicatorSetResponse).id
      const manuel = await testApp.app.inject({
        method: 'POST',
        url: url(`/indicator-sets/${autreSetId}/indicators`),
        cookies: coordinateurCookies,
        payload: {
          code: 'M1',
          label: 'Saisie',
          group: 'G',
          nature: 'manual',
          input: 'yesno',
        } as never,
      })
      const res = await testApp.app.inject({
        method: 'PUT',
        url: url(
          `/indicator-sets/${setId}/answers/2026/${(manuel.json() as IndicatorResponse).id}`,
        ),
        cookies: coordinateurCookies,
        payload: { boolValue: true } as never,
      })
      expect(res.statusCode).toBe(404)
    })

    it('refuse la saisie sur un indicateur calcule : 400', async () => {
      const res = await testApp.app.inject({
        method: 'PUT',
        url: url(`/indicator-sets/${setId}/answers/2026/${indicatorId}`),
        cookies: coordinateurCookies,
        payload: { numberValue: 1, textValue: null } as never,
      })
      expect(res.statusCode).toBe(400)
    })

    const archiver = (id: string) =>
      testApp.app.inject({
        method: 'PATCH',
        url: url(`/indicator-sets/${setId}/indicators/${id}`),
        cookies: coordinateurCookies,
        payload: { archived: true } as never,
      })

    it('rend sans parent l enfant d un indicateur archive', async () => {
      expect((await archiver(indicatorId)).statusCode).toBe(200)
      const res = await testApp.app.inject({
        method: 'GET',
        url: url(`/indicator-sets/${setId}/results?${periode}`),
        cookies: coordinateurCookies,
      })
      const ids = res.json().indicators.map((i: { id: string }) => i.id)
      expect(ids).not.toContain(indicatorId)
      expect(
        res
          .json()
          .indicators.find((i: { id: string }) => i.id === secondIndicatorId),
      ).toMatchObject({ code: '1.1bis', parentId: null })
    })

    it('refuse la saisie sur un indicateur archive : 404', async () => {
      expect((await archiver(secondIndicatorId)).statusCode).toBe(200)
      const res = await testApp.app.inject({
        method: 'PUT',
        url: url(`/indicator-sets/${setId}/answers/2026/${secondIndicatorId}`),
        cookies: coordinateurCookies,
        payload: { boolValue: true } as never,
      })
      expect(res.statusCode).toBe(404)
    })
  })
})
