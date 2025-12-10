import type { PrismaClient } from '@prisma/client'

export default async function seedSoignants(prisma: PrismaClient) {
  console.log('→ Seeding soignants...')

  const soignantsData = [
    { name: 'Educ IDE' },
    { name: 'Psychologue' },
    { name: 'Pharmacienne' },
    { name: 'Aide-soignante' },
    { name: 'Diététicienne' },
  ]

  const createdSoignants = await Promise.all(
    soignantsData.map((s) => prisma.soignant.create({ data: s })),
  )

  return createdSoignants.map((s) => s.id)
}
