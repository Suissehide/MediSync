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

type ServiceFieldChoiceResponse = {
  id: string
  key: string
  label: string
  order: number
  archived: boolean
}

type ServiceFieldResponse = {
  id: string
  key: string
  label: string
  type: string
  section: string
  order: number
  clinical: boolean
  unit: string | null
  archived: boolean
  choices: ServiceFieldChoiceResponse[]
}

// Un etablissement, un service, un COORDINATEUR et un INTERVENANT — une connexion par role,
// partagee par tout le fichier (sign-in est limite a 10/minute).
describe('definitions des champs de la fiche', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let coordinateurCookies: Cookies
  let intervenantCookies: Cookies

  const url = (path: string) => tenantUrl(establishmentId, serviceId, path)

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-CHAMPS')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-CHAMPS')
    serviceId = service.id

    await createUser({
      email: 'coordinateur@champs.fr',
      memberships: [
        {
          establishmentId,
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })
    await createUser({
      email: 'intervenant@champs.fr',
      memberships: [
        {
          establishmentId,
          services: [{ serviceId, role: 'INTERVENANT' }],
        },
      ],
    })

    testApp = await buildTestApp()
    coordinateurCookies = await signIn(testApp.app, 'coordinateur@champs.fr')
    intervenantCookies = await signIn(testApp.app, 'intervenant@champs.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  let premierChampId: string
  let secondChampId: string

  it('le coordinateur cree un champ multichoice avec ses choix', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: url('/service-fields'),
      cookies: coordinateurCookies,
      payload: {
        label: 'Comorbidités',
        type: 'multichoice',
        section: 'pathway',
        choices: ['HTA', 'Diabète type 2'],
      } as never,
    })
    expect(res.statusCode).toBe(201)
    const field = res.json() as ServiceFieldResponse
    expect(field.key).toBe('comorbidites')
    expect(field.order).toBe(0)
    expect(field.choices.map((c) => c.key)).toEqual(['HTA', 'DIABETE_TYPE_2'])
    premierChampId = field.id
  })

  it('un second champ de meme libelle recoit une cle suffixee et l ordre suivant', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: url('/service-fields'),
      cookies: coordinateurCookies,
      payload: {
        label: 'Comorbidités',
        type: 'multichoice',
        section: 'pathway',
      } as never,
    })
    expect(res.statusCode).toBe(201)
    const field = res.json() as ServiceFieldResponse
    expect(field.key).toBe('comorbidites2')
    expect(field.order).toBe(1)
    secondChampId = field.id
  })

  it('PATCH refuse type, key et clinical : 400, le champ relu est inchange', async () => {
    for (const payload of [
      { type: 'text' },
      { key: 'x' },
      { clinical: true },
    ]) {
      const res = await testApp.app.inject({
        method: 'PATCH',
        url: url(`/service-fields/${premierChampId}`),
        cookies: coordinateurCookies,
        payload: payload as never,
      })
      expect(res.statusCode).toBe(400)
    }

    const relu = await testDb.serviceFieldDefinition.findUniqueOrThrow({
      where: { id: premierChampId },
    })
    expect(relu.type).toBe('multichoice')
    expect(relu.key).toBe('comorbidites')
    expect(relu.clinical).toBe(false)
  })

  it('PATCH { archived: true } puis false archive et restaure, le GET le rend toujours', async () => {
    const archive = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-fields/${premierChampId}`),
      cookies: coordinateurCookies,
      payload: { archived: true } as never,
    })
    expect(archive.statusCode).toBe(200)
    expect((archive.json() as ServiceFieldResponse).archived).toBe(true)

    const liste = await testApp.app.inject({
      method: 'GET',
      url: url('/service-fields'),
      cookies: coordinateurCookies,
    })
    const champs = liste.json() as ServiceFieldResponse[]
    expect(champs.map((f) => f.id)).toContain(premierChampId)

    const restaure = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-fields/${premierChampId}`),
      cookies: coordinateurCookies,
      payload: { archived: false } as never,
    })
    expect(restaure.statusCode).toBe(200)
    expect((restaure.json() as ServiceFieldResponse).archived).toBe(false)
  })

  it('ajoute un choix, puis l archive', async () => {
    const ajout = await testApp.app.inject({
      method: 'POST',
      url: url(`/service-fields/${premierChampId}/choices`),
      cookies: coordinateurCookies,
      payload: { label: 'Asthme' } as never,
    })
    expect(ajout.statusCode).toBe(201)
    const champ = ajout.json() as ServiceFieldResponse
    const asthme = champ.choices.find((c) => c.key === 'ASTHME')
    expect(asthme).toBeDefined()
    expect(asthme?.order).toBe(2)

    const archivage = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-fields/${premierChampId}/choices/${asthme?.id}`),
      cookies: coordinateurCookies,
      payload: { archived: true } as never,
    })
    expect(archivage.statusCode).toBe(200)
    const choixArchive = (
      archivage.json() as ServiceFieldResponse
    ).choices.find((c) => c.key === 'ASTHME')
    expect(choixArchive?.archived).toBe(true)
  })

  it('PUT /order inverse les deux champs de la section pathway', async () => {
    const res = await testApp.app.inject({
      method: 'PUT',
      url: url('/service-fields/order'),
      cookies: coordinateurCookies,
      payload: {
        section: 'pathway',
        ids: [secondChampId, premierChampId],
      } as never,
    })
    expect(res.statusCode).toBe(204)

    const liste = await testApp.app.inject({
      method: 'GET',
      url: url('/service-fields'),
      cookies: coordinateurCookies,
    })
    const champs = liste.json() as ServiceFieldResponse[]
    const pathwayIds = champs
      .filter((f) => f.section === 'pathway')
      .sort((a, b) => a.order - b.order)
      .map((f) => f.id)
    expect(pathwayIds).toEqual([secondChampId, premierChampId])
  })

  it('l intervenant recoit 403 en ecriture et 200 en lecture', async () => {
    const creation = await testApp.app.inject({
      method: 'POST',
      url: url('/service-fields'),
      cookies: intervenantCookies,
      payload: {
        label: 'Autre champ',
        type: 'text',
        section: 'pathway',
      } as never,
    })
    expect(creation.statusCode).toBe(403)

    const lecture = await testApp.app.inject({
      method: 'GET',
      url: url('/service-fields'),
      cookies: intervenantCookies,
    })
    expect(lecture.statusCode).toBe(200)
  })

  it('cloisonnement : un champ du service A est absent du GET du service B, et inaccessible en PATCH', async () => {
    const serviceB = await createService(establishmentId, 'S-CHAMPS-B')
    await createUser({
      email: 'coordinateur-b@champs.fr',
      memberships: [
        {
          establishmentId,
          services: [{ serviceId: serviceB.id, role: 'COORDINATEUR' }],
        },
      ],
    })
    const cookiesB = await signIn(testApp.app, 'coordinateur-b@champs.fr')
    const urlB = (path: string) => tenantUrl(establishmentId, serviceB.id, path)

    const liste = await testApp.app.inject({
      method: 'GET',
      url: urlB('/service-fields'),
      cookies: cookiesB,
    })
    const champsB = liste.json() as ServiceFieldResponse[]
    expect(champsB.map((f) => f.id)).not.toContain(premierChampId)

    const patch = await testApp.app.inject({
      method: 'PATCH',
      url: urlB(`/service-fields/${premierChampId}`),
      cookies: cookiesB,
      payload: { archived: true } as never,
    })
    expect(patch.statusCode).toBe(404)
  })
})

// Un coordinateur cree les definitions par l'API ; un secretariat ecrit sans clinical:write.
describe('ecriture de la fiche', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let patientId: string
  let autrePatientId: string
  let coordinateurCookies: Cookies
  let secretariatCookies: Cookies
  let orientation: ServiceFieldResponse

  const url = (path: string) => tenantUrl(establishmentId, serviceId, path)

  const patchFiche = (cookies: Cookies, id: string, payload: unknown) =>
    testApp.app.inject({
      method: 'PATCH',
      url: url(`/patient/${id}/service-file`),
      cookies,
      payload: payload as never,
    })

  const stored = (id: string) =>
    testDb.patientServiceFile.findUniqueOrThrow({
      where: { patientId_serviceId: { patientId: id, serviceId } },
    })

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

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-FICHE')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-FICHE')
    serviceId = service.id

    for (const [email, role] of [
      ['coordinateur@fiche.fr', 'COORDINATEUR'],
      ['secretariat@fiche.fr', 'SECRETARIAT'],
    ] as const) {
      await createUser({
        email,
        memberships: [{ establishmentId, services: [{ serviceId, role }] }],
      })
    }

    for (const lastName of ['Fiche', 'Vide']) {
      const patient = await testDb.patient.create({
        data: {
          establishmentId,
          firstName: 'Jean',
          lastName,
          createDate: new Date('2026-01-01T00:00:00Z'),
        },
      })
      await testDb.patientServiceFile.create({
        data: { patientId: patient.id, serviceId, establishmentId },
      })
      if (lastName === 'Fiche') {
        patientId = patient.id
      } else {
        autrePatientId = patient.id
      }
    }

    testApp = await buildTestApp()
    coordinateurCookies = await signIn(testApp.app, 'coordinateur@fiche.fr')
    secretariatCookies = await signIn(testApp.app, 'secretariat@fiche.fr')

    orientation = await createField({
      label: 'orientation',
      type: 'choice',
      choices: ['A', 'B'],
    })
    await createField({ label: 'hba1c', type: 'number' })
    await createField({
      label: 'diag',
      type: 'choice',
      clinical: true,
      choices: ['AVC', 'AOMI'],
    })
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('le coordinateur ecrit data et clinicalData, rendus et stockes', async () => {
    const res = await patchFiche(coordinateurCookies, patientId, {
      data: { orientation: 'A', hba1c: 7.2 },
      clinicalData: { diag: 'AVC' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      data: { orientation: 'A', hba1c: 7.2 },
      clinicalData: { diag: 'AVC' },
    })
    const file = await stored(patientId)
    expect(file.data).toEqual({ orientation: 'A', hba1c: 7.2 })
    expect(file.clinicalData).toEqual({ diag: 'AVC' })
  })

  it('null efface la cle, les autres restent', async () => {
    const res = await patchFiche(coordinateurCookies, patientId, {
      data: { hba1c: null },
    })
    expect(res.statusCode).toBe(200)
    expect((await stored(patientId)).data).toEqual({ orientation: 'A' })
  })

  it('refuse un choix inconnu, une cle inconnue et une cle clinique dans data', async () => {
    for (const data of [
      { orientation: 'Z' },
      { inconnu: 1 },
      { diag: 'AVC' },
    ]) {
      const res = await patchFiche(coordinateurCookies, patientId, { data })
      expect(res.statusCode).toBe(400)
    }
    const file = await stored(patientId)
    expect(file.data).toEqual({ orientation: 'A' })
    expect(file.clinicalData).toEqual({ diag: 'AVC' })
  })

  it('un choix archive reste accepte la ou il est deja la valeur, refuse ailleurs', async () => {
    const choixA = orientation.choices.find((c) => c.key === 'A')
    const archivage = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/service-fields/${orientation.id}/choices/${choixA?.id}`),
      cookies: coordinateurCookies,
      payload: { archived: true } as never,
    })
    expect(archivage.statusCode).toBe(200)

    const meme = await patchFiche(coordinateurCookies, patientId, {
      data: { orientation: 'A' },
    })
    expect(meme.statusCode).toBe(200)

    const autre = await patchFiche(coordinateurCookies, autrePatientId, {
      data: { orientation: 'A' },
    })
    expect(autre.statusCode).toBe(400)
    expect((await stored(autrePatientId)).data).toEqual({})
  })

  it('le secretariat ecrit data mais pas clinicalData, qu il ne relit pas', async () => {
    const res = await patchFiche(secretariatCookies, patientId, {
      data: { orientation: 'B' },
      clinicalData: { diag: 'AOMI' },
    })
    expect(res.statusCode).toBe(200)
    const file = await stored(patientId)
    expect(file.data).toEqual({ orientation: 'B' })
    expect(file.clinicalData).toEqual({ diag: 'AVC' })

    const lecture = await testApp.app.inject({
      method: 'GET',
      url: url(`/patient/${patientId}/service-file`),
      cookies: secretariatCookies,
    })
    expect(lecture.statusCode).toBe(200)
    expect(lecture.json()).not.toHaveProperty('clinicalData')
  })

  it('un PATCH mixte valide ecrit les colonnes fixes et les valeurs', async () => {
    const res = await patchFiche(coordinateurCookies, autrePatientId, {
      notes: 'Y',
      data: { orientation: 'B' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      notes: 'Y',
      data: { orientation: 'B' },
    })
    const file = await stored(autrePatientId)
    expect(file.notes).toBe('Y')
    expect(file.data).toEqual({ orientation: 'B' })
  })

  it('un PATCH mixte dont une valeur est invalide laisse tout le dossier intact', async () => {
    const res = await patchFiche(coordinateurCookies, autrePatientId, {
      notes: 'X',
      data: { orientation: 'Z' },
    })
    expect(res.statusCode).toBe(400)
    const file = await stored(autrePatientId)
    expect(file.notes).toBe('Y')
    expect(file.data).toEqual({ orientation: 'B' })
  })
})
