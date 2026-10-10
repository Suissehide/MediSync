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

  it('PATCH invalide sur un patient sans sous-dossier dans ce service : 400, aucun PatientServiceFile cree', async () => {
    const patientSansDossier = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Jean',
        lastName: 'SansDossier',
        createDate: new Date('2026-01-01T00:00:00Z'),
      },
    })
    const res = await patchFiche(coordinateurCookies, patientSansDossier.id, {
      data: { orientation: 'Z' },
    })
    expect(res.statusCode).toBe(400)
    const file = await testDb.patientServiceFile.findUnique({
      where: {
        patientId_serviceId: { patientId: patientSansDossier.id, serviceId },
      },
    })
    expect(file).toBeNull()
  })
})

// Liste et export construits depuis les definitions du service : la liste retire les champs
// `longtext` de data/clinicalData, l'export ajoute une colonne par champ actif (clinique
// seulement a qui a clinical:read), triee par section puis ordre, apres les colonnes fixes.
describe('liste et export', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let patientId: string
  let coordinateurCookies: Cookies
  let secretariatCookies: Cookies

  const url = (path: string) => tenantUrl(establishmentId, serviceId, path)
  const OBJECTIF =
    'Un objectif redige en plusieurs phrases, assez long pour representer un texte libre.'

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-LISTE')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-LISTE')
    serviceId = service.id
    const tenant = { establishmentId, serviceId }

    for (const [email, role] of [
      ['coordinateur@liste.fr', 'COORDINATEUR'],
      ['secretariat@liste.fr', 'SECRETARIAT'],
    ] as const) {
      await createUser({
        email,
        memberships: [{ establishmentId, services: [{ serviceId, role }] }],
      })
    }

    await testDb.serviceFieldDefinition.create({
      data: {
        ...tenant,
        key: 'goal',
        label: 'Objectif',
        type: 'longtext',
        section: 'pathway',
        order: 0,
      },
    })
    await testDb.serviceFieldDefinition.create({
      data: {
        ...tenant,
        key: 'orientation',
        label: 'Orientation',
        type: 'choice',
        section: 'pathway',
        order: 1,
        choices: {
          create: [{ key: 'A', label: 'Alpha', order: 0, establishmentId }],
        },
      },
    })
    await testDb.serviceFieldDefinition.create({
      data: {
        ...tenant,
        key: 'comorbidites',
        label: 'Comorbidités',
        type: 'multichoice',
        section: 'pathway',
        order: 2,
        choices: {
          create: [
            { key: 'HTA', label: 'Hypertension', order: 0, establishmentId },
            { key: 'DIAB', label: 'Diabète', order: 1, establishmentId },
          ],
        },
      },
    })
    await testDb.serviceFieldDefinition.create({
      data: {
        ...tenant,
        key: 'tabac',
        label: 'Tabac',
        type: 'boolean',
        section: 'pathway',
        order: 3,
      },
    })
    await testDb.serviceFieldDefinition.create({
      data: {
        ...tenant,
        key: 'sortie',
        label: 'Sortie',
        type: 'date',
        section: 'pathway',
        order: 4,
      },
    })
    await testDb.serviceFieldDefinition.create({
      data: {
        ...tenant,
        key: 'diag',
        label: 'Diag',
        type: 'choice',
        section: 'pathway',
        order: 5,
        clinical: true,
        choices: {
          create: [{ key: 'AVC', label: 'AVC', order: 0, establishmentId }],
        },
      },
    })
    await testDb.serviceFieldDefinition.create({
      data: {
        ...tenant,
        key: 'ancien',
        label: 'Ancien',
        type: 'text',
        section: 'pathway',
        order: 6,
        archivedAt: new Date(),
      },
    })

    const patient = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Jean',
        lastName: 'Complet',
        createDate: new Date('2026-01-01T00:00:00Z'),
      },
    })
    patientId = patient.id
    await testDb.patientServiceFile.create({
      data: {
        ...tenant,
        patientId,
        data: {
          goal: OBJECTIF,
          orientation: 'A',
          comorbidites: ['HTA', 'DIAB'],
          tabac: true,
          sortie: '2026-03-01',
        },
        clinicalData: { diag: 'AVC' },
      },
    })

    testApp = await buildTestApp()
    coordinateurCookies = await signIn(testApp.app, 'coordinateur@liste.fr')
    secretariatCookies = await signIn(testApp.app, 'secretariat@liste.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('GET /patient/with-tags retire goal (longtext) de data, clinicalData selon clinical:read', async () => {
    const coord = await testApp.app.inject({
      method: 'GET',
      url: url('/patient/with-tags'),
      cookies: coordinateurCookies,
    })
    expect(coord.statusCode).toBe(200)
    const coordPatients = coord.json() as {
      id: string
      data?: Record<string, unknown>
      clinicalData?: Record<string, unknown>
    }[]
    const coordPatient = coordPatients.find((p) => p.id === patientId)
    expect(coordPatient?.data).toMatchObject({
      orientation: 'A',
      comorbidites: ['HTA', 'DIAB'],
      tabac: true,
      sortie: '2026-03-01',
    })
    expect(coordPatient?.data).not.toHaveProperty('goal')
    expect(coordPatient?.clinicalData).toEqual({ diag: 'AVC' })

    const secretariat = await testApp.app.inject({
      method: 'GET',
      url: url('/patient/with-tags'),
      cookies: secretariatCookies,
    })
    expect(secretariat.statusCode).toBe(200)
    const secretariatPatient = (secretariat.json() as { id: string }[]).find(
      (p) => p.id === patientId,
    )
    expect(secretariatPatient).not.toHaveProperty('clinicalData')
  })

  it('export : une colonne par champ actif, triee, sans le champ archive', async () => {
    const coord = await testApp.app.inject({
      method: 'GET',
      url: url('/patient/export'),
      cookies: coordinateurCookies,
    })
    const secretariat = await testApp.app.inject({
      method: 'GET',
      url: url('/patient/export'),
      cookies: secretariatCookies,
    })
    expect(coord.statusCode).toBe(200)
    expect(secretariat.statusCode).toBe(200)

    const headersOf = (rawPayload: Buffer): string[] => {
      const workbook = XLSX.read(rawPayload, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        throw new Error('classeur exporte sans feuille')
      }
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) {
        throw new Error('classeur exporte sans feuille nommee')
      }
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
      const headerRow = rows[0]
      if (!headerRow) {
        throw new Error('classeur exporte sans ligne d en-tete')
      }
      return headerRow
    }

    const rowOf = (rawPayload: Buffer): Record<string, string> => {
      const workbook = XLSX.read(rawPayload, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        throw new Error('classeur exporte sans feuille')
      }
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) {
        throw new Error('classeur exporte sans feuille nommee')
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet)
      const row = rows.find((r) => r.Prénom === 'Jean' && r.Nom === 'Complet')
      if (!row) {
        throw new Error('ligne du patient introuvable')
      }
      return row
    }

    const secretariatHeaders = headersOf(secretariat.rawPayload)
    const coordHeaders = headersOf(coord.rawPayload)

    // Apres les colonnes fixes, une colonne par champ actif triee par section puis ordre :
    // Objectif (longtext, inclus), Orientation, Comorbidités, Tabac, Sortie, puis Diag
    // (clinique) seulement pour qui a clinical:read. Ancien (archive) n'apparait jamais.
    expect(secretariatHeaders.slice(-5)).toEqual([
      'Objectif',
      'Orientation',
      'Comorbidités',
      'Tabac',
      'Sortie',
    ])
    expect(secretariatHeaders).not.toContain('Diag')
    expect(secretariatHeaders).not.toContain('Ancien')

    expect(coordHeaders.slice(-6)).toEqual([
      'Objectif',
      'Orientation',
      'Comorbidités',
      'Tabac',
      'Sortie',
      'Diag',
    ])
    expect(coordHeaders).not.toContain('Ancien')

    const coordRow = rowOf(coord.rawPayload)
    expect(coordRow).toMatchObject({
      Orientation: 'Alpha',
      Comorbidités: 'Hypertension, Diabète',
      Tabac: 'Oui',
      Sortie: '01/03/2026',
      Diag: 'AVC',
      Objectif: OBJECTIF,
    })

    const secretariatRow = rowOf(secretariat.rawPayload)
    expect(secretariatRow).not.toHaveProperty('Diag')
    expect(secretariatRow).toMatchObject({
      Orientation: 'Alpha',
      Objectif: OBJECTIF,
    })
  })

  it('un champ outcome cree avant un champ pathway s exporte quand meme apres (ordre par section)', async () => {
    const establishment = await createEstablishment('E-MIXTE')
    const idEtablissement = establishment.id
    const service = await createService(idEtablissement, 'S-MIXTE')
    const idService = service.id
    const urlMixte = (path: string) =>
      tenantUrl(idEtablissement, idService, path)

    await createUser({
      email: 'coordinateur@mixte.fr',
      memberships: [
        {
          establishmentId: idEtablissement,
          services: [{ serviceId: idService, role: 'COORDINATEUR' }],
        },
      ],
    })
    const cookies = await signIn(testApp.app, 'coordinateur@mixte.fr')

    // Cree la section outcome EN PREMIER, la section pathway ensuite : un tri par
    // `order` seul, ou par `section` alphabetique, la ferait sortir avant.
    await testDb.serviceFieldDefinition.create({
      data: {
        establishmentId: idEtablissement,
        serviceId: idService,
        key: 'bilan',
        label: 'Bilan',
        type: 'text',
        section: 'outcome',
        order: 0,
      },
    })
    await testDb.serviceFieldDefinition.create({
      data: {
        establishmentId: idEtablissement,
        serviceId: idService,
        key: 'etape',
        label: 'Etape',
        type: 'text',
        section: 'pathway',
        order: 0,
      },
    })

    const liste = await testApp.app.inject({
      method: 'GET',
      url: urlMixte('/service-fields'),
      cookies,
    })
    expect(liste.statusCode).toBe(200)
    expect((liste.json() as ServiceFieldResponse[]).map((f) => f.key)).toEqual([
      'etape',
      'bilan',
    ])

    const patient = await testDb.patient.create({
      data: {
        establishmentId: idEtablissement,
        firstName: 'Marie',
        lastName: 'Mixte',
        createDate: new Date('2026-01-01T00:00:00Z'),
      },
    })
    await testDb.patientServiceFile.create({
      data: {
        establishmentId: idEtablissement,
        serviceId: idService,
        patientId: patient.id,
        data: { etape: 'E', bilan: 'B' },
      },
    })

    const export_ = await testApp.app.inject({
      method: 'GET',
      url: urlMixte('/patient/export'),
      cookies,
    })
    expect(export_.statusCode).toBe(200)
    const workbook = XLSX.read(export_.rawPayload, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      throw new Error('classeur exporte sans feuille')
    }
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) {
      throw new Error('classeur exporte sans feuille nommee')
    }
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    const headerRow = rows[0]
    if (!headerRow) {
      throw new Error('classeur exporte sans ligne d en-tete')
    }
    expect(headerRow.slice(-2)).toEqual(['Etape', 'Bilan'])
  })
})
