import type { PrismaClient } from '../../src/generated/client'
import type { PatientData } from './data/patient'
import type { SeedTenant } from './tenant'

// La liste de patients est passée par l'appelant (et non plus importée en dur
// ici) : chaque service reçoit son propre jeu, avec des noms distincts, pour
// qu'une fuite entre services saute aux yeux plutôt que de se noyer dans des
// données identiques.
export default async function seedPatients(
  prisma: PrismaClient,
  tenant: SeedTenant,
  patients: PatientData[],
) {
  console.log('→ Seeding patients...')

  const createdPatients = await Promise.all(
    patients.map((p) =>
      prisma.patient.create({
        data: {
          ...p,
          createDate: new Date(),
          establishmentId: tenant.establishmentId,
        },
      }),
    ),
  )

  console.log(`✓ Created ${createdPatients.length} patients`)

  return createdPatients
}
