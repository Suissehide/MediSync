import type { PrismaClient } from '../../src/generated/client'
import { SOIGNANTS } from './data/soignant'
import type { SeedTenant } from './tenant'

export default async function seedSoignants(
  prisma: PrismaClient,
  tenant: SeedTenant,
) {
  console.log('→ Seeding soignants...')

  const createdSoignants = await Promise.all(
    SOIGNANTS.map((s) =>
      prisma.soignant.create({
        data: { ...s, establishmentId: tenant.establishmentId },
      }),
    ),
  )

  console.log(`✓ Created ${createdSoignants.length} soignants`)

  return createdSoignants
}
