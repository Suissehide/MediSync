import { hashPassword } from '../../main/utils/hash'
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'

const password = 'Motdepasse1!'

// Le document d'habilitations reserve le contenu clinique a `clinical:read` :
// ni le secretariat ni la lecture seule ne doivent le voir, y compris quand
// le patient est embarque par une autre reponse.
describe('filtrage des champs cliniques selon clinical:read', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let patientId: string

  const signIn = async (email: string) => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password },
    })
    expect(res.statusCode).toBe(200)
    return (res.cookies as { name: string; value: string }[])
      .map((c) => `${c.name}=${c.value}`)
      .join('; ')
  }

  const get = (cookie: string, url: string) =>
    testApp.app.inject({
      method: 'GET',
      url: `/e/${establishmentId}/s/${serviceId}${url}`,
      headers: { cookie },
    })

  const patch = (cookie: string, url: string, payload: unknown) =>
    testApp.app.inject({
      method: 'PATCH',
      url: `/e/${establishmentId}/s/${serviceId}${url}`,
      headers: { cookie },
      payload: payload as never,
    })

  const storedPatient = () =>
    testDb.patient.findUniqueOrThrow({ where: { id: patientId } })

  beforeAll(async () => {
    await truncateAll()
    const { hash, salt } = hashPassword(password)
    const establishment = await testDb.establishment.create({
      data: { name: 'E' },
    })
    establishmentId = establishment.id
    const service = await testDb.service.create({
      data: { establishmentId, name: 'S' },
    })
    serviceId = service.id
    const tenant = { establishmentId, serviceId }

    for (const [email, role] of [
      ['secretariat@b.fr', 'SECRETARIAT'],
      ['intervenant@b.fr', 'INTERVENANT'],
    ] as const) {
      const account = await testDb.user.create({
        data: { email, password: hash, salt },
      })
      await testDb.establishmentMembership.create({
        data: {
          userId: account.id,
          establishmentId,
          role: 'MEMBER',
          serviceMemberships: {
            create: [{ establishmentId, serviceId, role }],
          },
        },
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
    await testDb.appointmentPatient.create({
      data: {
        ...tenant,
        appointmentId: appointment.id,
        patientId,
        accompanying: 'Conjoint',
        transmissionNotes: 'TRANSMISSION-SECRETE',
      },
    })

    testApp = await buildTestApp()
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('les retire pour un secretariat, sur la fiche, la liste et le creneau', async () => {
    const cookie = await signIn('secretariat@b.fr')

    const one = (await get(cookie, `/patient/${patientId}`)).json()
    expect(one).toMatchObject({
      firstName: 'Jean',
      etpDecision: 'oui',
      goal: 'objectif',
    })
    expect(one).not.toHaveProperty('notes')
    expect(one).not.toHaveProperty('details')
    expect(one).not.toHaveProperty('medicalDiagnosis')

    const list = (await get(cookie, '/patient')).json()
    expect(list).toHaveLength(1)
    expect(list[0]).not.toHaveProperty('notes')

    // Patient embarque par un creneau : rendez-vous -> participant -> patient.
    const slots = await get(cookie, '/slot')
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
    const cookie = await signIn('intervenant@b.fr')

    const one = (await get(cookie, `/patient/${patientId}`)).json()
    expect(one).toMatchObject({
      notes: 'NOTE-SECRETE',
      details: 'DETAIL-SECRET',
      medicalDiagnosis: 'DIAGNOSTIC-SECRET',
    })

    const slots = await get(cookie, '/slot')
    expect(slots.statusCode).toBe(200)
    expect(slots.body).toContain('TRANSMISSION-SECRETE')
  })

  it('retire les colonnes cliniques de l export Excel pour un secretariat', async () => {
    const withoutClinical = await get(
      await signIn('secretariat@b.fr'),
      '/patient/export',
    )
    const withClinical = await get(
      await signIn('intervenant@b.fr'),
      '/patient/export',
    )

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
    const cookie = await signIn('secretariat@b.fr')

    const res = await patch(cookie, `/patient/${patientId}`, {
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
    const cookie = await signIn('intervenant@b.fr')

    const res = await patch(cookie, `/patient/${patientId}`, {
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
})
