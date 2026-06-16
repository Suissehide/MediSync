import type { Location, PrismaClient } from '../../src/generated/client'
import { LOCATIONS } from './data/location'

export default async function seedLocations(
  prisma: PrismaClient,
): Promise<Location[]> {
  console.log('→ Seeding locations...')

  const created = await Promise.all(
    LOCATIONS.map((name) =>
      prisma.location.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  )

  console.log(`✓ Created ${created.length} locations`)

  return created
}
