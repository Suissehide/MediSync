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

// L'incident de production du 2026-10-07 : supprimer la thematique « Mes facteurs de risque »
// a vide le `thematicId` de tous les rendez-vous deja crees, par le `onDelete: SetNull` de la
// relation. Rien dans la base n'en gardait la trace, la restauration a demande un dump.
// « Retirer de la liste » archive desormais, et ce fichier echoue si la suppression dure revient.
describe('archivage d une thematique', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let cookies: Cookies

  const url = (path: string) => tenantUrl(establishmentId, serviceId, path)

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-ARCHIVAGE')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-ARCHIVAGE')
    serviceId = service.id

    await createUser({
      email: 'coordinateur@archivage.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })

    testApp = await buildTestApp()
    cookies = await signIn(testApp.app, 'coordinateur@archivage.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  const creerRendezVousAvecThematique = async (name: string) => {
    const thematic = await testDb.thematic.create({
      data: { name, serviceId, establishmentId },
    })
    const slotTemplate = await testDb.slotTemplate.create({
      data: {
        startTime: new Date('2026-04-01T09:00:00Z'),
        endTime: new Date('2026-04-01T10:00:00Z'),
        offsetDays: 0,
        isIndividual: true,
        color: '#fff',
        thematicId: thematic.id,
        serviceId,
        establishmentId,
      },
    })
    const slot = await testDb.slot.create({
      data: {
        startDate: new Date('2026-04-01T09:00:00Z'),
        endDate: new Date('2026-04-01T10:00:00Z'),
        slotTemplateID: slotTemplate.id,
        serviceId,
        establishmentId,
      },
    })
    const appointment = await testDb.appointment.create({
      data: {
        startDate: new Date('2026-04-01T09:00:00Z'),
        endDate: new Date('2026-04-01T09:30:00Z'),
        slotID: slot.id,
        thematicId: thematic.id,
        serviceId,
        establishmentId,
      },
    })
    return { thematic, slotTemplate, appointment }
  }

  it('DELETE archive au lieu de supprimer : le rendez-vous et le modele de creneau gardent leur thematique', async () => {
    const { thematic, slotTemplate, appointment } =
      await creerRendezVousAvecThematique('Mes facteurs de risque')

    const archive = await testApp.app.inject({
      method: 'DELETE',
      url: url(`/thematic/${thematic.id}`),
      cookies,
    })
    expect(archive.statusCode).toBe(204)

    // La ligne est toujours la : c'est ce qui empeche le SetNull.
    const ligne = await testDb.thematic.findUnique({
      where: { id: thematic.id },
    })
    expect(ligne).not.toBeNull()
    expect(ligne?.archivedAt).toBeInstanceOf(Date)

    const rdv = await testDb.appointment.findUnique({
      where: { id: appointment.id },
    })
    expect(rdv?.thematicId).toBe(thematic.id)

    const modele = await testDb.slotTemplate.findUnique({
      where: { id: slotTemplate.id },
    })
    expect(modele?.thematicId).toBe(thematic.id)
  })

  it('une archivee sort des listes de choix et se consulte a part', async () => {
    const actives = await testApp.app.inject({
      method: 'GET',
      url: url('/thematic'),
      cookies,
    })
    expect(actives.statusCode).toBe(200)
    expect(
      (actives.json() as { name: string }[]).map((t) => t.name),
    ).not.toContain('Mes facteurs de risque')

    const archivees = await testApp.app.inject({
      method: 'GET',
      url: url('/thematic?archived=true'),
      cookies,
    })
    expect(archivees.statusCode).toBe(200)
    expect(
      (archivees.json() as { name: string }[]).map((t) => t.name),
    ).toContain('Mes facteurs de risque')
  })

  it('PATCH { archived: false } la restaure, sans dump ni intervention en base', async () => {
    const archivee = await testDb.thematic.findFirstOrThrow({
      where: { serviceId, archivedAt: { not: null } },
    })

    const restauration = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/thematic/${archivee.id}`),
      cookies,
      payload: { archived: false } as never,
    })
    expect(restauration.statusCode).toBe(200)

    const actives = await testApp.app.inject({
      method: 'GET',
      url: url('/thematic'),
      cookies,
    })
    expect((actives.json() as { name: string }[]).map((t) => t.name)).toContain(
      'Mes facteurs de risque',
    )
  })

  // Le formulaire d'un rendez-vous renvoie son `thematicId` inchange a chaque
  // enregistrement. Si la validation de la cible filtrait les archivees, un rendez-vous
  // qui en porte une deviendrait impossible a reenregistrer.
  it('un rendez-vous qui porte une thematique archivee reste modifiable', async () => {
    const { thematic, appointment } =
      await creerRendezVousAvecThematique('Mon alimentation')
    await testDb.thematic.update({
      where: { id: thematic.id },
      data: { archivedAt: new Date() },
    })

    const modification = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/appointment/${appointment.id}`),
      cookies,
      payload: { thematicId: thematic.id, motif: 'reenregistre' } as never,
    })
    expect(modification.statusCode).toBe(200)
  })
})
