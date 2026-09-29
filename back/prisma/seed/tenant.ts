import type { PrismaClient } from '../../src/generated/client'

export type SeedTenant = { establishmentId: string; serviceId: string }

// Deux services pour pouvoir vérifier à la main, sans manipuler la base, ce
// qu'un seul établissement ne permettait pas : le sélecteur de service (qui
// n'a de sens qu'à partir de deux choix) et le cloisonnement entre services
// (invisible tant que les deux services contiennent les mêmes données).
export default async function seedTenant(prisma: PrismaClient) {
  console.log('→ Seeding establishment and two services...')
  const establishment = await prisma.establishment.create({
    data: { name: 'CHU Haut-Lévêque' },
  })
  const serviceA = await prisma.service.create({
    data: { establishmentId: establishment.id, name: 'Cardiologie' },
  })
  const serviceB = await prisma.service.create({
    data: { establishmentId: establishment.id, name: 'Pneumologie' },
  })
  // Champs nommés plutôt qu'un tableau : avec `noUncheckedIndexedAccess`,
  // déstructurer `services[0]`/`services[1]` les typerait `Service | undefined`
  // alors que les deux existent toujours ici.
  return { establishment, serviceA, serviceB }
}
