import type { PrismaClient } from '../../src/generated/client'
import { ETP_FIELD_PRESET } from '../../src/main/utils/etp-field-preset'
import type { PatientData } from './data/patient'
import type { SeedTenant } from './tenant'

// La liste de patients est passée par l'appelant (et non plus importée en dur
// ici) : chaque service reçoit son propre jeu, avec des noms distincts, pour
// qu'une fuite entre services saute aux yeux plutôt que de se noyer dans des
// données identiques.
//
// Depuis la migration `patient_service_file`, les seize colonnes
// de parcours ne vivent plus sur `Patient` : `p.clinicalFile`, quand il est présent, porte
// celles que ce jeu de données utilise. Le sous-dossier créé ici est rattaché au service de
// l'appelant (`tenant.serviceId`) — le seed connaît déjà ce service, un jeu de patients par
// service reçoit donc son propre sous-dossier, jamais celui d'un autre.
// Configuration ETP des services du seed : la migration service_fields ne la pose que sur les services existants.
export async function seedEtpFields(prisma: PrismaClient, tenant: SeedTenant) {
  for (const [order, field] of ETP_FIELD_PRESET.entries()) {
    await prisma.serviceFieldDefinition.create({
      data: {
        ...tenant,
        key: field.key,
        label: field.label,
        type: field.type,
        section: field.section,
        clinical: field.clinical,
        order,
        choices: {
          create: field.choices.map((c, i) => ({
            establishmentId: tenant.establishmentId,
            key: c.key,
            label: c.label,
            order: i,
          })),
        },
      },
    })
  }
}

export default async function seedPatients(
  prisma: PrismaClient,
  tenant: SeedTenant,
  patients: PatientData[],
) {
  console.log('→ Seeding patients...')

  const createdPatients = await Promise.all(
    patients.map(async (p) => {
      const { clinicalFile, ...identity } = p
      const patient = await prisma.patient.create({
        data: {
          ...identity,
          createDate: new Date(),
          establishmentId: tenant.establishmentId,
        },
      })

      if (clinicalFile) {
        await prisma.patientServiceFile.create({
          data: {
            ...clinicalFile,
            patientId: patient.id,
            serviceId: tenant.serviceId,
            establishmentId: tenant.establishmentId,
          },
        })
      }

      return patient
    }),
  )

  console.log(`✓ Created ${createdPatients.length} patients`)

  return createdPatients
}
