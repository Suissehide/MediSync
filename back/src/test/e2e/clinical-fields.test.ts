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
// le patient est embarque par une autre reponse.
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

  const storedPatient = () =>
    testDb.patient.findUniqueOrThrow({ where: { id: patientId } })

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
        notes: 'NOTE-SECRETE',
        details: 'DETAIL-SECRET',
        medicalDiagnosis: 'DIAGNOSTIC-SECRET',
        // Donnees administratives du programme : visibles de tous.
        etpDecision: 'oui',
        goal: 'objectif',
        programType: 'standard',
        stopReason: 'aucun',
      },
    })
    patientId = patient.id

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

  it('les retire pour un secretariat, sur la fiche, la liste et le creneau', async () => {
    const cookies = secretariatCookies

    const one = (await get(cookies, `/patient/${patientId}`)).json()
    expect(one).toMatchObject({
      firstName: 'Jean',
      etpDecision: 'oui',
      goal: 'objectif',
    })
    expect(one).not.toHaveProperty('notes')
    expect(one).not.toHaveProperty('details')
    expect(one).not.toHaveProperty('medicalDiagnosis')

    const list = (await get(cookies, '/patient')).json()
    expect(list).toHaveLength(1)
    expect(list[0]).not.toHaveProperty('notes')

    // Patient embarque par un creneau : rendez-vous -> participant -> patient.
    const slots = await get(cookies, '/slot')
    const serialized = slots.body
    expect(slots.statusCode).toBe(200)
    expect(serialized).not.toContain('NOTE-SECRETE')
    expect(serialized).not.toContain('DIAGNOSTIC-SECRET')
    expect(serialized).not.toContain('TRANSMISSION-SECRETE')
    // Le reste de la reponse est bien la : le filtre retire des champs, pas
    // la charge utile.
    expect(serialized).toContain('Conjoint')
  })

  it('les conserve pour un intervenant, qui a clinical:read', async () => {
    const cookies = intervenantCookies

    const one = (await get(cookies, `/patient/${patientId}`)).json()
    expect(one).toMatchObject({
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
    // Le classeur est un ZIP : les libelles de colonnes et les valeurs y sont
    // compresses. On compare donc la seule chose observable sans dependance
    // supplementaire — la taille — apres avoir verifie que le contenu differe.
    expect(withoutClinical.rawPayload.equals(withClinical.rawPayload)).toBe(
      false,
    )
    expect(withoutClinical.rawPayload.length).toBeLessThan(
      withClinical.rawPayload.length,
    )
  })

  // Pendant du filtrage de sortie : un role qui ne peut pas lire le contenu
  // clinique ne doit pas pouvoir l'ecraser a l'aveugle.
  it('ignore les champs cliniques envoyes par un secretariat, sans les vider', async () => {
    const cookies = secretariatCookies

    const res = await patch(cookies, `/patient/${patientId}`, {
      firstName: 'Jeanne',
      notes: 'ECRASE',
      details: 'ECRASE',
      medicalDiagnosis: 'ECRASE',
    })
    expect(res.statusCode).toBe(200)

    const stored = await storedPatient()
    // Le champ non clinique est bien modifie : la requete n'a pas ete rejetee.
    expect(stored.firstName).toBe('Jeanne')
    // Les champs cliniques sont INCHANGES — ni ecrases par la valeur envoyee,
    // ni vides par le retrait de la cle.
    expect(stored.notes).toBe('NOTE-SECRETE')
    expect(stored.details).toBe('DETAIL-SECRET')
    expect(stored.medicalDiagnosis).toBe('DIAGNOSTIC-SECRET')
  })

  it('applique les champs cliniques envoyes par un intervenant, qui a clinical:write', async () => {
    const cookies = intervenantCookies

    const res = await patch(cookies, `/patient/${patientId}`, {
      notes: 'NOTE-MODIFIEE',
      medicalDiagnosis: 'DIAGNOSTIC-MODIFIE',
    })
    expect(res.statusCode).toBe(200)

    const stored = await storedPatient()
    expect(stored.notes).toBe('NOTE-MODIFIEE')
    expect(stored.medicalDiagnosis).toBe('DIAGNOSTIC-MODIFIE')
    // Non envoye : inchange.
    expect(stored.details).toBe('DETAIL-SECRET')
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
  // d'un patient par un role sans `clinical:write`.
  it('cree un patient sans les champs cliniques envoyes par un secretariat', async () => {
    const cookies = secretariatCookies

    const res = await post(cookies, '/patient', {
      firstName: 'Nouveau',
      lastName: 'Patient',
      notes: 'NE-DOIT-PAS-ETRE-STOCKE',
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).not.toHaveProperty('notes')

    const created = await testDb.patient.findUniqueOrThrow({
      where: { id: res.json().id },
    })
    expect(created.firstName).toBe('Nouveau')
    expect(created.notes).toBeNull()

    // Nettoyage : le premier test de ce fichier affirme `toHaveLength(1)` sur
    // la liste des patients. Sans ce nettoyage, l'ordre d'exécution des tests
    // deviendrait significatif alors que rien ne le signale.
    await testDb.patient.delete({ where: { id: created.id } })
  })
})
