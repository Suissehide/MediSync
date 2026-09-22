import type { PrismaClient } from '../../src/generated/client'

export type SeedTenant = { establishmentId: string; serviceId: string }

export default async function seedTenant(prisma: PrismaClient) {
  console.log('→ Seeding establishment and service...')
  const establishment = await prisma.establishment.create({
    data: { name: 'CHU de démonstration' },
  })
  const service = await prisma.service.create({
    data: { establishmentId: establishment.id, name: 'Réadaptation' },
  })
  return { establishment, service }
}
