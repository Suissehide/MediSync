import { PrismaClient } from '@prisma/client'

import seedPathways from './pathway'
import seedPatients from './patient'
import seedSoignants from './soignant'
import seedTodos from './todo'
import seedUsers from './user'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seeding...')

  await seedUsers(prisma)
  const soignantIDs = await seedSoignants(prisma)
  await seedPatients(prisma)
  await seedPathways(prisma, soignantIDs)
  await seedTodos(prisma)

  console.log('✅ Seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
