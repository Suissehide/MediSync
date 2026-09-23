import type { PrismaClient, Soignant } from '../../src/generated/client'
import { THEMATICS } from './data/thematic'
import type { SeedTenant } from './tenant'

export default async function seedThematics(
  prisma: PrismaClient,
  soignants: Soignant[],
  tenant: SeedTenant,
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

      // serviceId est déduit de la relation vers Thematic (clé composite),
      // Prisma le refuse comme champ explicite dans cette création imbriquée.
      const soignantLinks = soignantIDs.map((soignantId) => ({
        soignantId,
        establishmentId: tenant.establishmentId,
      }))

      return prisma.thematic.upsert({
        where: {
          serviceId_name: { serviceId: tenant.serviceId, name: t.name },
        },
        update: {
          duration,
          soignantLinks: {
            deleteMany: {},
            create: soignantLinks,
          },
        },
        create: {
          name: t.name,
          duration,
          establishmentId: tenant.establishmentId,
          serviceId: tenant.serviceId,
          soignantLinks: {
            create: soignantLinks,
          },
        },
      })
    }),
  )

  console.log(`✓ Created ${createdThematics.length} thematics`)

  return createdThematics
}
