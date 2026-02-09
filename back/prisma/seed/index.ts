import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../generated/prisma/client'
import seedPathwayTemplates from './pathwayTemplate'
import seedPatients from './patient'
import seedSoignants from './soignant'
import seedTodos from './todo'
import seedUsers from './user'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Starting database seeding...')

  await seedUsers(prisma)
  const soignants = await seedSoignants(prisma)
  await seedPatients(prisma)
  await seedPathwayTemplates(prisma, soignants)
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
