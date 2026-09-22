import type { Location, PrismaClient } from '../../src/generated/client'
import { LOCATIONS } from './data/location'
import type { SeedTenant } from './tenant'

export default async function seedLocations(
  prisma: PrismaClient,
  tenant: SeedTenant,
): Promise<Location[]> {
  console.log('→ Seeding locations...')

  const created = await Promise.all(
    LOCATIONS.map((name) =>
      prisma.location.upsert({
        where: {
          establishmentId_name: {
            establishmentId: tenant.establishmentId,
            name,
          },
        },
        update: {},
        create: { name, establishmentId: tenant.establishmentId },
      }),
    ),
  )

  console.log(`✓ Created ${created.length} locations`)

  return created
}
