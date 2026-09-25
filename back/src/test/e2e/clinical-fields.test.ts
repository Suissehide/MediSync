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

// Le document d'habilitations reserve le contenu clinique a `clinical:read` :
// ni le secretariat ni la lecture seule ne doivent le voir, y compris quand
// le patient est embarque par une autre reponse, ou quand ce contenu vit sur
// le sous-dossier de service plutot que sur le patient lui-meme (etape 3 du
// multi-tenant : notes/details/medicalDiagnosis ont demenage vers
// `PatientServiceFile` ; etpDecision/goal/programType/stopReason avec eux,
// mais restent des donnees administratives visibles de tous — voir
// utils/clinical-fields.ts).
describe('filtrage des champs cliniques selon clinical:read / clinical:write', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let patientId: string
  let appointmentId: string
  let appointmentPatientId: string
  // Une connexion par role, partagee par tous les tests de ce fichier :
  // `POST /auth/sign-in` est limite a 10/minute, et ce fichier a largement
  // plus de neuf tests qui s'authentifient.
  let secretariatCookies: Cookies
  let intervenantCookies: Cookies

  const get = (cookies: Cookies, url: string) =>
    testApp.app.inject({
      method: 'GET',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies,
    })

  const patch = (cookies: Cookies, url: string, payload: unknown) =>
    testApp.app.inject({
      method: 'PATCH',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies,
      payload: payload as never,
    })

  const post = (cookies: Cookies, url: string, payload: unknown) =>
    testApp.app.inject({
      method: 'POST',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies,
      payload: payload as never,
    })

  const storedServiceFile = () =>
    testDb.patientServiceFile.findUniqueOrThrow({
      where: { patientId_serviceId: { patientId, serviceId } },
    })

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S')
    serviceId = service.id
    const tenant = { establishmentId, serviceId }

    for (const [email, role] of [
      ['secretariat@b.fr', 'SECRETARIAT'],
      ['intervenant@b.fr', 'INTERVENANT'],
    ] as const) {
      await createUser({
        email,
        memberships: [
          { establishmentId, role: 'MEMBER', services: [{ serviceId, role }] },
        ],
      })
    }

    const patient = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Jean',
        lastName: 'Patient',
        createDate: new Date('2026-01-01T00:00:00Z'),
      },
    })
    patientId = patient.id

    // Sous-dossier de service (etape 3 du multi-tenant) : les seize colonnes
    // de parcours et de contenu clinique vivent ici, plus sur Patient.
    // notes/details/medicalDiagnosis sont cliniques ; etpDecision/goal/
    // programType/stopReason sont administratifs, visibles de tous.
    await testDb.patientServiceFile.create({
      data: {
        ...tenant,
        patientId,
        notes: 'NOTE-SECRETE',
        details: 'DETAIL-SECRET',
        medicalDiagnosis: 'DIAGNOSTIC-SECRET',
        etpDecision: 'oui',
        goal: 'objectif',
        programType: 'standard',
        stopReason: 'aucun',
      },
    })

    const slotTemplate = await testDb.slotTemplate.create({
      data: {
        ...tenant,
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T10:00:00Z'),
        offsetDays: 0,
        isIndividual: true,
        color: '#000000',
      },
    })
    const slot = await testDb.slot.create({
      data: {
        ...tenant,
        startDate: new Date('2026-01-01T09:00:00Z'),
        endDate: new Date('2026-01-01T10:00:00Z'),
        slotTemplateID: slotTemplate.id,
      },
    })
    const appointment = await testDb.appointment.create({
      data: {
        ...tenant,
        startDate: new Date('2026-01-01T09:00:00Z'),
        endDate: new Date('2026-01-01T10:00:00Z'),
        slotID: slot.id,
      },
    })
    appointmentId = appointment.id
    const appointmentPatient = await testDb.appointmentPatient.create({
      data: {
        ...tenant,
        appointmentId: appointment.id,
        patientId,
        accompanying: 'Conjoint',
        transmissionNotes: 'TRANSMISSION-SECRETE',
      },
    })
    appointmentPatientId = appointmentPatient.id

    testApp = await buildTestApp()
    secretariatCookies = await signIn(testApp.app, 'secretariat@b.fr')
    intervenantCookies = await signIn(testApp.app, 'intervenant@b.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('les retire pour un secretariat, sur le sous-dossier et sur la transmission embarquee par un creneau', async () => {
    const cookies = secretariatCookies

    const one = (await get(cookies, `/patient/${patientId}`)).json()
    expect(one).toMatchObject({ firstName: 'Jean' })

    // Sous-dossier : meme route, memes permissions que le patient
    // (patient:read) — le filtrage doit s'y appliquer sans modification
    // (spec §5.2). "Comme aujourd'hui" : trois champs cliniques masques sur
    // seize, les donnees administratives du parcours restent visibles.
    const file = (
      await get(cookies, `/patient/${patientId}/service-file`)
    ).json()
    expect(file).toMatchObject({
      etpDecision: 'oui',
      goal: 'objectif',
      programType: 'standard',
      stopReason: 'aucun',
    })
    expect(file).not.toHaveProperty('notes')
    expect(file).not.toHaveProperty('details')
    expect(file).not.toHaveProperty('medicalDiagnosis')

    const list = (await get(cookies, '/patient')).json()
    expect(list).toHaveLength(1)
    // `notes` n'est plus une colonne de `Patient` depuis l'etape 3 : cette
    // assertion passe deja quand le crochet de sortie est entierement
    // neutralise (verifie a la relecture de la tache 8), elle ne prouve donc
    // rien aujourd'hui. Gardee volontairement comme filet d'avance pour les
    // taches 6/7/12/13, qui vont imbriquer le sous-dossier dans la liste.
    expect(list[0]).not.toHaveProperty('notes')

    // Patient embarque par un creneau : rendez-vous -> participant -> patient.
    const slots = await get(cookies, '/slot')
    const serialized = slots.body
    expect(slots.statusCode).toBe(200)
    // notes/medicalDiagnosis ne sont plus des colonnes de `Patient` non plus :
    // memes raisons que ci-dessus, ces deux-la ne prouvent rien aujourd'hui.
    // Filets d'avance pour les memes taches, qui vont imbriquer le
    // sous-dossier sous un creneau.
    expect(serialized).not.toContain('NOTE-SECRETE')
    expect(serialized).not.toContain('DIAGNOSTIC-SECRET')
    // Celle-ci, en revanche, prouve quelque chose des aujourd'hui :
    // `transmissionNotes` vit sur `AppointmentPatient`, un modele que le
    // creneau embarque reellement (rendez-vous -> participant) ; sa presence
    // ici montrerait que le crochet de sortie ne recurse pas.
    expect(serialized).not.toContain('TRANSMISSION-SECRETE')
    // Le reste de la reponse est bien la : le filtre retire des champs, pas
    // la charge utile.
    expect(serialized).toContain('Conjoint')
  })

  it('les conserve pour un intervenant, qui a clinical:read, sur la fiche comme sur le sous-dossier', async () => {
    const cookies = intervenantCookies

    const one = (await get(cookies, `/patient/${patientId}`)).json()
    expect(one).toMatchObject({ firstName: 'Jean' })

    // Sens inverse du test precedent : un role qui a le droit clinique voit
    // bien les trois champs sur le sous-dossier (pas seulement leur absence
    // ne suffit pas a prouver le filtrage : il faut aussi prouver qu'ils
    // sont bien rendus a qui y a droit).
    const file = (
      await get(cookies, `/patient/${patientId}/service-file`)
    ).json()
    expect(file).toMatchObject({
      notes: 'NOTE-SECRETE',
      details: 'DETAIL-SECRET',
      medicalDiagnosis: 'DIAGNOSTIC-SECRET',
    })

    const slots = await get(cookies, '/slot')
    expect(slots.statusCode).toBe(200)
    expect(slots.body).toContain('TRANSMISSION-SECRETE')
  })

  it('retire les colonnes cliniques de l export Excel pour un secretariat', async () => {
    const withoutClinical = await get(secretariatCookies, '/patient/export')
    const withClinical = await get(intervenantCookies, '/patient/export')

    expect(withoutClinical.statusCode).toBe(200)
    expect(withClinical.statusCode).toBe(200)

    // Une taille differente ne dit pas QUELLES colonnes ont disparu : une
    // taille egale, ou differente pour une autre raison que le filtrage,
    // passerait ici au vert. On lit donc les deux classeurs et on nomme les
    // en-tetes, colonne par colonne (`xlsx` est deja une dependance du code
    // de production qui les genere).
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

    const secretariatHeaders = headersOf(withoutClinical.rawPayload)
    const clinicalHeaders = headersOf(withClinical.rawPayload)

    // `details` (le troisieme champ clinique) n'est pas une colonne de
    // l'export du tout, pour aucun role : seuls deux des trois champs
    // cliniques y sont exposes. La liste attendue le dit nommement, plutot
    // que de deduire "moins trois colonnes" d'une difference de taille.
    expect(clinicalHeaders).toEqual([
      ...secretariatHeaders,
      'Diagnostic médical',
      'Notes',
    ])
    expect(secretariatHeaders).not.toContain('Diagnostic médical')
    expect(secretariatHeaders).not.toContain('Notes')
  })

  // Pendant du filtrage de sortie : un role qui ne peut pas lire le contenu
  // clinique ne doit pas pouvoir l'ecraser a l'aveugle. C'est le point qui
  // compte le plus : un secretariat qui enregistre le sous-dossier ne doit
  // ni l'ecraser ni le vider.
  it('ignore les champs cliniques envoyes par un secretariat sur le sous-dossier, sans les vider', async () => {
    const cookies = secretariatCookies

    const res = await patch(cookies, `/patient/${patientId}/service-file`, {
      goal: 'objectif modifie',
      notes: 'ECRASE',
      details: 'ECRASE',
      medicalDiagnosis: 'ECRASE',
    })
    expect(res.statusCode).toBe(200)

    const stored = await storedServiceFile()
    // Le champ non clinique est bien modifie : la requete n'a pas ete rejetee.
    expect(stored.goal).toBe('objectif modifie')
    // Les champs cliniques sont INCHANGES — ni ecrases par la valeur envoyee,
    // ni vides par le retrait de la cle.
    expect(stored.notes).toBe('NOTE-SECRETE')
    expect(stored.details).toBe('DETAIL-SECRET')
    expect(stored.medicalDiagnosis).toBe('DIAGNOSTIC-SECRET')
  })

  it('applique les champs cliniques envoyes par un intervenant, qui a clinical:write', async () => {
    const cookies = intervenantCookies

    const res = await patch(cookies, `/patient/${patientId}/service-file`, {
      notes: 'NOTE-MODIFIEE',
      medicalDiagnosis: 'DIAGNOSTIC-MODIFIE',
    })
    expect(res.statusCode).toBe(200)

    const stored = await storedServiceFile()
    expect(stored.notes).toBe('NOTE-MODIFIEE')
    expect(stored.medicalDiagnosis).toBe('DIAGNOSTIC-MODIFIE')
    // Non envoye : inchange.
    expect(stored.details).toBe('DETAIL-SECRET')
  })

  // Cas qui aurait pu etre Critique (releve a la relecture de la tache 8) :
  // le schema `upsertPatientServiceFileBodySchema` declare les trois champs
  // `.optional().nullable()`, donc `null` est syntaxiquement recevable par
  // Zod. Un secretariat pourrait donc croire qu'envoyer `null` explicitement
  // — par exemple en vidant un champ de formulaire — efface la colonne, la ou
  // omettre la cle la laisse inchangee. Ce n'est pas le cas : `stripClinicalInput`
  // s'execute en `preValidation`, avant que Zod ne voie le corps, et retire la
  // cle `null` comme n'importe quelle autre.
  it('ignore un `notes`/`details`/`medicalDiagnosis` envoye a `null` explicitement par un secretariat, sans vider les colonnes', async () => {
    const cookies = secretariatCookies
    const before = await storedServiceFile()

    const res = await patch(cookies, `/patient/${patientId}/service-file`, {
      goal: 'objectif avec null explicite',
      notes: null,
      details: null,
      medicalDiagnosis: null,
    })
    expect(res.statusCode).toBe(200)

    const stored = await storedServiceFile()
    // Le champ non clinique est bien modifie : la requete n'a pas ete rejetee.
    expect(stored.goal).toBe('objectif avec null explicite')
    // Les champs cliniques restent a leur valeur precedente : `null` explicite
    // ne les vide pas, exactement comme l'omission de la cle.
    expect(stored.notes).toBe(before.notes)
    expect(stored.details).toBe(before.details)
    expect(stored.medicalDiagnosis).toBe(before.medicalDiagnosis)
  })

  // Contre-epreuve indispensable : sans elle, le test precedent pourrait
  // passer au vert parce que l'ecriture de `null` ne marche plus du tout
  // (par exemple si Prisma ignorait silencieusement toute valeur `null`),
  // et non parce que le crochet de secretariat protege specifiquement.
  it('vide bien notes/details/medicalDiagnosis a `null` quand un intervenant l envoie explicitement (contre-epreuve)', async () => {
    const cookies = intervenantCookies

    const res = await patch(cookies, `/patient/${patientId}/service-file`, {
      notes: null,
      details: null,
      medicalDiagnosis: null,
    })
    expect(res.statusCode).toBe(200)

    const stored = await storedServiceFile()
    expect(stored.notes).toBeNull()
    expect(stored.details).toBeNull()
    expect(stored.medicalDiagnosis).toBeNull()
  })

  // Chemin peu exerce jusqu'ici : la transmission d'un patient deja inscrit a
  // un rendez-vous se modifie via PATCH /appointment, pas via PATCH /patient.
  // `appointment:write` (que le secretariat detient) ne doit pas suffire a
  // ecrire ce champ clinique-la non plus.
  it('ignore la transmission envoyee par un secretariat sur un rendez-vous existant', async () => {
    const cookies = secretariatCookies

    const res = await patch(cookies, `/appointment/${appointmentId}`, {
      appointmentPatients: [
        {
          id: appointmentPatientId,
          patientID: patientId,
          transmissionNotes: 'ECRASE',
        },
      ],
    })
    expect(res.statusCode).toBe(200)

    const stored = await testDb.appointmentPatient.findUniqueOrThrow({
      where: { id: appointmentPatientId },
    })
    expect(stored.transmissionNotes).toBe('TRANSMISSION-SECRETE')
    // Le reste du participant n'est pas touche par le retrait du champ.
    expect(stored.accompanying).toBe('Conjoint')
  })

  it('applique la transmission envoyee par un intervenant, qui a clinical:write', async () => {
    const cookies = intervenantCookies

    const res = await patch(cookies, `/appointment/${appointmentId}`, {
      appointmentPatients: [
        {
          id: appointmentPatientId,
          patientID: patientId,
          transmissionNotes: 'TRANSMISSION-MISE-A-JOUR',
        },
      ],
    })
    expect(res.statusCode).toBe(200)

    const stored = await testDb.appointmentPatient.findUniqueOrThrow({
      where: { id: appointmentPatientId },
    })
    expect(stored.transmissionNotes).toBe('TRANSMISSION-MISE-A-JOUR')

    // Remet l'etat initial pour ne pas influencer un test precedent qui
    // s'executerait dans un autre ordre (Jest ne le garantit qu'au sein d'un
    // meme fichier, mais autant ne pas en dependre).
    await testDb.appointmentPatient.update({
      where: { id: appointmentPatientId },
      data: { transmissionNotes: 'TRANSMISSION-SECRETE' },
    })
  })

  // Second chemin peu exerce : la creation, pas seulement la modification,
  // du sous-dossier par un role sans `clinical:write`. Avant l'etape 3, ce
  // test creait un patient directement avec `notes` dans le corps de
  // `POST /patient` : la colonne a quitte `Patient` pour
  // `PatientServiceFile`, qui n'est jamais cree par `POST /patient` (spec
  // §5.1) mais seulement a sa premiere ecriture — donc ici, par le premier
  // `PATCH /patient/:id/service-file` du patient nouvellement cree.
  it('cree le sous-dossier a sa premiere ecriture sans les champs cliniques envoyes par un secretariat', async () => {
    const cookies = secretariatCookies

    const createdPatient = await post(cookies, '/patient', {
      firstName: 'Nouveau',
      lastName: 'Patient',
    })
    expect(createdPatient.statusCode).toBe(201)
    const nouveauPatientId = createdPatient.json().id as string

    const storedPatient = await testDb.patient.findUniqueOrThrow({
      where: { id: nouveauPatientId },
    })
    expect(storedPatient.firstName).toBe('Nouveau')

    const res = await patch(
      cookies,
      `/patient/${nouveauPatientId}/service-file`,
      {
        goal: 'objectif initial',
        notes: 'NE-DOIT-PAS-ETRE-STOCKE',
      },
    )
    expect(res.statusCode).toBe(200)
    expect(res.json()).not.toHaveProperty('notes')

    const createdFile = await testDb.patientServiceFile.findUniqueOrThrow({
      where: {
        patientId_serviceId: { patientId: nouveauPatientId, serviceId },
      },
    })
    expect(createdFile.goal).toBe('objectif initial')
    expect(createdFile.notes).toBeNull()

    // Nettoyage : le premier test de ce fichier affirme `toHaveLength(1)` sur
    // la liste des patients. Sans ce nettoyage, l'ordre d'execution des tests
    // deviendrait significatif alors que rien ne le signale.
    await testDb.patient.delete({ where: { id: nouveauPatientId } })
  })
})
