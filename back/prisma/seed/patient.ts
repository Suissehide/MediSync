import type { PrismaClient } from '../../src/generated/client'
import { PATIENTS } from './data/patient'
import type { SeedTenant } from './tenant'

export default async function seedPatients(
  prisma: PrismaClient,
  tenant: SeedTenant,
) {
  console.log('→ Seeding patients...')

  const createdPatients = await Promise.all(
    PATIENTS.map((p) =>
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
