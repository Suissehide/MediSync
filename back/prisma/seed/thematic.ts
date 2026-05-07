import type { PrismaClient, Soignant } from '../../src/generated/client'
import { THEMATICS } from './data/thematic'

export default async function seedThematics(
  prisma: PrismaClient,
  soignants: Soignant[],
) {
  console.log('→ Seeding thematics...')

  const soignantByName = new Map(soignants.map((s) => [s.name, s]))

  const createdThematics = await Promise.all(
    THEMATICS.map((t) => {
      const soignantIDs = t.soignantNames
        .map((name) => soignantByName.get(name)?.id)
        .filter((id): id is string => !!id)

      // Use the first (smallest) duration as default
      const duration = t.durations.length > 0 ? t.durations[0] : 15

      return prisma.thematic.upsert({
        where: { name: t.name },
        update: {
          duration,
          soignants: {
            set: soignantIDs.map((id) => ({ id })),
          },
        },
        create: {
          name: t.name,
          duration,
          soignants: {
            connect: soignantIDs.map((id) => ({ id })),
          },
        },
      })
    }),
  )

  console.log(`✓ Created ${createdThematics.length} thematics`)

  return createdThematics
}
