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

      return prisma.thematic.create({
        data: {
          name: t.name,
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
