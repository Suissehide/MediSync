import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// `ensureExists` (patientServiceFile.repository.ts) n'est appele que depuis deux chemins —
// `processEnrollments` et `DiagnosticEducatifDomain.create` — parce que ce sont les deux seuls
// modeles qui portent une cle etrangere composite (patientId, serviceId) vers
// `PatientServiceFile` : `EnrollmentIssue` et `DiagnosticEducatif`. Voir le commentaire de
// `ensureExists` pour le detail.
//
// `AppointmentPatient` et `PatientPathwayPriority` portent, eux aussi, un `serviceId` lie au
// patient, et n'appellent PAS `ensureExists` — sans consequence aujourd'hui puisqu'aucun des
// deux ne porte cette cle etrangere. Ce test tient exactement cette absence : si l'un des deux
// modeles gagne un jour une relation vers `PatientServiceFile` dans le schema (la tache 6
// remplace des relations `patient` par `serviceFile` sur d'autres modeles, sur ce meme terrain),
// ce test rougit — le signal qu'il faut relire le commentaire de `ensureExists` et, si la
// relation le demande, ajouter l'appel avant de deployer la migration.
//
// Ce que ce test NE PROUVE PAS : il ne peut pas verifier que l'appel a ete ajoute quand la
// relation apparait, seulement que la relation n'est pas apparue sans qu'on y ait pense. Prouver
// l'appel demanderait un test e2e qui cree la ligne concernee pour un patient sans sous-dossier
// prealable et s'attend a un succes plutot qu'a une violation de cle etrangere — un tel test
// existe deja pour `AppointmentPatient` (`src/test/e2e/appointment.test.ts`, cas "POST
// /appointment avec un patientID cree le rendez-vous") : il rougirait lui aussi, avec une
// violation de cle etrangere a la place d'un 500 de composite key, le jour ou la relation
// apparaitrait sans l'appel.

const schemaPath = join(__dirname, '../../../../prisma/schema.prisma')
const schema = readFileSync(schemaPath, 'utf8')
const withoutComments = schema.replace(/\/\/.*$/gm, '')

const modelBody = (name: string): string => {
  const pattern = new RegExp(`model\\s+${name}\\s*\\{([^}]*)\\}`)
  const match = pattern.exec(withoutComments)
  if (!match?.[1]) {
    throw new Error(`model ${name} introuvable dans prisma/schema.prisma`)
  }
  return match[1]
}

// Une relation vers PatientServiceFile se declare `Nom Type PatientServiceFile[?]` avec un
// `@relation(...)` portant `patientId` et `serviceId` (la seule cle disponible sur ce modele).
// On se contente ici de chercher le nom du modele cible comme type de champ : suffisant pour
// detecter l'ajout d'une relation, sans avoir a reproduire tout le parseur de
// tenant-guard-schema.test.ts pour ces deux seuls modeles.
const declaresRelationTo = (body: string, targetModel: string): boolean =>
  new RegExp(`^\\s*\\w+\\s+${targetModel}\\??\\s`, 'm').test(body)

describe('ensureExists ne couvre que EnrollmentIssue et DiagnosticEducatif — a bon droit', () => {
  it('AppointmentPatient ne porte aucune relation vers PatientServiceFile', () => {
    expect(
      declaresRelationTo(modelBody('AppointmentPatient'), 'PatientServiceFile'),
    ).toBe(false)
  })

  it('PatientPathwayPriority ne porte aucune relation vers PatientServiceFile', () => {
    expect(
      declaresRelationTo(
        modelBody('PatientPathwayPriority'),
        'PatientServiceFile',
      ),
    ).toBe(false)
  })

  // Garde-fou du garde-fou : si `declaresRelationTo` cessait de reconnaitre une vraie relation,
  // les deux tests ci-dessus deviendraient vrais par construction plutot que par preuve.
  it('declaresRelationTo reconnait bien une relation existante vers PatientServiceFile', () => {
    expect(
      declaresRelationTo(modelBody('EnrollmentIssue'), 'PatientServiceFile'),
    ).toBe(true)
    expect(
      declaresRelationTo(modelBody('DiagnosticEducatif'), 'PatientServiceFile'),
    ).toBe(true)
  })
})
